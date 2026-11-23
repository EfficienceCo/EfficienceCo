// FOLHA-8 (#748): o pipeline da folha avança o checklist do processo folha_pagamento do mesmo
// cliente e mês. HTTP de verdade e banco descartável de verdade (massa #680, dois escritórios);
// o bucket "folhas-pagamento" é uma memória (o descartável não tem Storage, ver o aviso em
// folha-upload-agente-http.test.js). Só dado sintético.
//
// Decisão: efficience-vault/decisoes/2026-11-20-folha-8-checklist-automatico.md. Checklist de 6
// etapas: 1 planilha recebida, 2 folha calculada, 3 holerites gerados (automáticas, só o
// pipeline conclui) e 4 revisar, 5 enviar, 6 arquivar (manuais). Um processo por escritório + mês.
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import supabase from "../src/config/database.js";
import { iniciarApiTeste } from "./helpers/http.js";
import { recriarMassa680 } from "./helpers/massa-680.js";
import { lerTabela, resetarBanco } from "./helpers/banco.js";
import { gerarCpfSintetico } from "./fixtures/massa-680.js";
import { cabecalhoLicenca, criarLicenca } from "./helpers/licenca-agente.js";
import { COLUNAS_FOLHA } from "../src/services/folha.service.js";
import { mesReferenciaAtual } from "../src/services/folha-checklist.service.js";
import { gerarFolhaMensal } from "../src/jobs/folha-mensal.job.js";
import { PERFIS } from "../src/config/perfis.js";

const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const LINHA_VALIDA = {
  empresa: "Empresa Sintetica Um", funcionario: "Maria Sintetica", cpf: gerarCpfSintetico("748900011"),
  cargo: "Caixa", salario_bruto: 1500, dias_trabalhados: 30, horas_extras: 0, faltas: 0, adiantamento: 0,
  num_dependentes: 0, vale_transporte: false,
};
// CPF com dígito errado: o upload aceita (só confere colunas) e o cálculo falha.
const LINHA_INVALIDA = { ...LINHA_VALIDA, funcionario: "Jose Sintetico", cpf: "12345678900" };
const ESTADO_INICIAL = [false, false, false, false, false, false];

async function planilha(linhas) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Folha");
  ws.addRow(COLUNAS_FOLHA.map(coluna => coluna.header));
  for (const linha of linhas) ws.addRow(COLUNAS_FOLHA.map(coluna => linha[coluna.key]));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function criarBucketEmMemoria() {
  const arquivos = new Map();
  const bucket = {
    falharHolerites: false,
    async upload(caminho, conteudo, { upsert = false } = {}) {
      if (bucket.falharHolerites && caminho.includes("/holerites/")) {
        return { data: null, error: { message: "falha injetada no PDF (teste)" } };
      }
      if (arquivos.has(caminho) && !upsert) return { data: null, error: { message: "The resource already exists" } };
      arquivos.set(caminho, Buffer.from(conteudo));
      return { data: { path: caminho }, error: null };
    },
    async download(caminho) {
      if (!arquivos.has(caminho)) return { data: null, error: { message: "Object not found" } };
      return { data: new Blob([arquivos.get(caminho)]), error: null };
    },
    async remove(caminhos) {
      for (const caminho of caminhos) arquivos.delete(caminho);
      return { data: [], error: null };
    },
  };
  return { arquivos, bucket };
}

async function esperar(descricao, ler, pronto, limiteMs = 30_000) {
  const limite = Date.now() + limiteMs;
  for (;;) {
    const valor = await ler();
    if (pronto(valor)) return valor;
    if (Date.now() > limite) throw new Error(`${descricao} não aconteceu: ${JSON.stringify(valor)}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

describe("FOLHA-8: o pipeline da folha avança o checklist do processo (HTTP e banco reais)", { timeout: 300_000 }, () => {
  let api;
  let banco;
  let A;
  let B;
  let usuarioA;
  let tokenA;
  let tokenB;
  let memoria;
  const originalStorageFrom = supabase.storage.from;
  const originalFrom = supabase.from;

  before(async () => { api = await iniciarApiTeste(); });
  after(async () => {
    supabase.storage.from = originalStorageFrom;
    supabase.from = originalFrom;
    try { await api.fechar(); } finally { await resetarBanco(); }
  });
  beforeEach(async () => {
    supabase.from = originalFrom;
    let massa;
    ({ massa, banco } = await recriarMassa680());
    [A, B] = massa.tabelas.clientes;
    usuarioA = massa.tabelas.usuarios.find(u => u.cliente_id === A.id && u.perfil === PERFIS.ADMIN_CLIENTE);
    tokenA = await criarLicenca(banco, A.id);
    tokenB = await criarLicenca(banco, B.id);
    memoria = criarBucketEmMemoria();
    supabase.storage.from = nome => {
      assert.equal(nome, "folhas-pagamento");
      return memoria.bucket;
    };
  });

  async function enviar(token, { linhas = [LINHA_VALIDA], mes = "2026-10" } = {}) {
    const dados = new FormData();
    dados.append("planilha", new Blob([await planilha(linhas)], { type: MIME_XLSX }), "folha.xlsx");
    dados.append("mes_referencia", mes);
    const resposta = await api.requisitar("/folha/upload/agente", {
      metodo: "POST", formulario: dados, cabecalhos: cabecalhoLicenca(token),
    });
    assert.equal(resposta.status, 201, JSON.stringify(resposta.corpo));
    return resposta.corpo.processamento_id;
  }

  const esperarPipeline = id => esperar(`pipeline de ${id}`,
    async () => (await banco.from("processamentos_folha").select("*").eq("id", id).single()).data,
    p => p.status === "erro" || (p.status === "concluido" && p.saida_status !== "pendente"));

  async function processosFolha(clienteId = A.id) {
    return lerTabela(banco, "processos", "criado_em", { cliente_id: clienteId, tipo: "folha_pagamento" });
  }
  async function processoDoMes(clienteId, mes) {
    const processos = (await processosFolha(clienteId)).filter(p => p.mes_referencia === mes);
    assert.equal(processos.length, 1, `esperava 1 processo de ${mes}: ${JSON.stringify(processos)}`);
    return processos[0];
  }
  const etapas = processoId => lerTabela(banco, "etapas", "ordem", { processo_id: processoId });
  const concluidas = async processoId => (await etapas(processoId)).map(e => e.concluida);
  // O marco 3 é gravado depois de saida_status = ok: espera ele (ou o estado pedido) chegar.
  const esperarEstado = (processoId, estado) => esperar(`checklist ${JSON.stringify(estado)}`,
    () => concluidas(processoId), atual => JSON.stringify(atual) === JSON.stringify(estado));

  async function criarProcessoPelaRota(mes) {
    const resposta = await api.requisitar("/processos", {
      usuario: usuarioA, metodo: "POST", corpo: { tipo: "folha_pagamento", mes_referencia: mes },
    });
    assert.equal(resposta.status, 201, JSON.stringify(resposta.corpo));
    return resposta.corpo;
  }

  const clicar = (processoId, etapaId) => api.requisitar(`/processos/${processoId}/etapas/${etapaId}`, {
    usuario: usuarioA, metodo: "PATCH", corpo: {},
  });

  it("T1: processo do mês existe; upload completo: 1, 2 e 3 concluídas, 4, 5 e 6 pendentes (GET /processos)", async () => {
    const criado = await criarProcessoPelaRota("2026-10");
    assert.equal(criado.etapas.length, 6);

    await esperarPipeline(await enviar(tokenA));
    await esperarEstado(criado.id, [true, true, true, false, false, false]);

    const lista = await api.requisitar("/processos?tipo=folha_pagamento", { usuario: usuarioA });
    assert.equal(lista.status, 200);
    assert.equal(lista.corpo.length, 1);
    const [processo] = lista.corpo;
    assert.equal(processo.id, criado.id);
    assert.equal(processo.status, "em_andamento");
    assert.deepEqual(processo.etapas.map(e => [e.descricao, e.status]), [
      ["Planilha da folha recebida", "concluida"],
      ["Folha calculada (INSS, IRRF e FGTS)", "concluida"],
      ["Holerites e relatório de fechamento gerados", "concluida"],
      ["Revisar holerites gerados", "pendente"],
      ["Enviar holerites às empresas", "pendente"],
      ["Arquivar documentação do mês", "pendente"],
    ]);
    assert.equal(processo.percentual_conclusao, 50);
    assert.ok(processo.etapas.slice(0, 3).every(e => e.concluida_em));
  });

  it("T2: sem processo do mês, o upload cria 1 processo com 6 etapas e conclui 1, 2 e 3", async () => {
    assert.deepEqual(await processosFolha(), []);

    const id = await enviar(tokenA, { mes: "2026-10-15" });
    // O marco 1 é gravado antes do 201: o processo já existe quando o upload responde.
    const processo = await processoDoMes(A.id, "2026-10-01");
    // (2 e 3 podem já ter avançado: o pipeline roda em segundo plano depois do 201.)
    assert.equal((await concluidas(processo.id))[0], true);

    await esperarPipeline(id);
    await esperarEstado(processo.id, [true, true, true, false, false, false]);
    assert.equal((await processosFolha()).length, 1);
    assert.equal((await etapas(processo.id)).length, 6);
  });

  it("T3: planilha que falha no cálculo: só a 1 conclui; 2 e 3 pendentes", async () => {
    const final = await esperarPipeline(await enviar(tokenA, { linhas: [LINHA_INVALIDA] }));
    assert.equal(final.status, "erro");

    const processo = await processoDoMes(A.id, "2026-10-01");
    assert.deepEqual(await concluidas(processo.id), [true, false, false, false, false, false]);
  });

  it("T4: falha na geração do PDF deixa a 3 pendente; o retry POST /folha/:id/gerar-saida conclui a 3", async () => {
    memoria.bucket.falharHolerites = true;
    const id = await enviar(tokenA);
    const comFalha = await esperarPipeline(id);
    assert.equal(comFalha.saida_status, "erro");
    const processo = await processoDoMes(A.id, "2026-10-01");
    assert.deepEqual(await concluidas(processo.id), [true, true, false, false, false, false]);

    memoria.bucket.falharHolerites = false;
    const retry = await api.requisitar(`/folha/${id}/gerar-saida`, { usuario: usuarioA, metodo: "POST", corpo: {} });
    assert.equal(retry.status, 200, JSON.stringify(retry.corpo));
    // No retry o marco é gravado antes da resposta.
    assert.deepEqual(await concluidas(processo.id), [true, true, true, false, false, false]);
  });

  it("T5: reenviar a mesma competência (uma válida, uma inválida, outra válida) não retrocede nem duplica", async () => {
    const primeiro = await enviar(tokenA);
    await esperarPipeline(primeiro);
    const processo = await processoDoMes(A.id, "2026-10-01");
    await esperarEstado(processo.id, [true, true, true, false, false, false]);
    const antes = await etapas(processo.id);

    await esperarPipeline(await enviar(tokenA, { linhas: [LINHA_INVALIDA] }));
    await esperarPipeline(await enviar(tokenA));

    assert.equal((await processosFolha()).length, 1);
    const depois = await etapas(processo.id);
    assert.equal(depois.length, 6);
    // Nada retrocedeu e as datas de conclusão são as da primeira vez (o UPDATE só pega concluida = false).
    assert.deepEqual(depois.map(e => [e.id, e.concluida, e.concluida_em]), antes.map(e => [e.id, e.concluida, e.concluida_em]));
  });

  it("T6: processo de outro mês do mesmo escritório e do outro escritório no mesmo mês ficam intocados", async () => {
    const outroMes = await criarProcessoPelaRota("2026-09");
    // O B tem processo e processamento próprios em 2026-10 (com o processamento parado em erro).
    await esperarPipeline(await enviar(tokenB, { linhas: [LINHA_INVALIDA] }));
    const processoB = await processoDoMes(B.id, "2026-10-01");
    const fotoB = await etapas(processoB.id);
    const fotoOutroMes = await etapas(outroMes.id);

    await esperarPipeline(await enviar(tokenA));
    const processoA = await processoDoMes(A.id, "2026-10-01");
    await esperarEstado(processoA.id, [true, true, true, false, false, false]);

    assert.deepEqual(await etapas(outroMes.id), fotoOutroMes);
    assert.deepEqual(fotoOutroMes.map(e => e.concluida), ESTADO_INICIAL);
    assert.deepEqual(await etapas(processoB.id), fotoB);
    assert.deepEqual(fotoB.map(e => e.concluida), [true, false, false, false, false, false]);
    assert.equal((await processosFolha(B.id)).length, 1);
  });

  it("T7: dois uploads em paralelo sem processo prévio criam 1 só processo (índice único)", async () => {
    const ids = await Promise.all([enviar(tokenA), enviar(tokenA), enviar(tokenA)]);
    await Promise.all(ids.map(esperarPipeline));

    const processos = await processosFolha();
    assert.equal(processos.length, 1, JSON.stringify(processos));
    await esperarEstado(processos[0].id, [true, true, true, false, false, false]);
    assert.equal((await etapas(processos[0].id)).length, 6);
  });

  it("T8: etapa manual já clicada é preservada; PATCH numa automática responde 400", async () => {
    const criado = await criarProcessoPelaRota("2026-10");
    const [planilhaRecebida, , , revisar] = criado.etapas.sort((x, y) => x.ordem - y.ordem);
    assert.equal((await clicar(criado.id, revisar.id)).status, 200);

    const recusa = await clicar(criado.id, planilhaRecebida.id);
    assert.equal(recusa.status, 400);
    assert.match(recusa.corpo.erro, /automatizada/);
    assert.deepEqual(await concluidas(criado.id), [false, false, false, true, false, false]);

    await esperarPipeline(await enviar(tokenA));
    await esperarEstado(criado.id, [true, true, true, true, false, false]);
    // Depois de concluída pelo pipeline, o clique continua recusado.
    assert.equal((await clicar(criado.id, planilhaRecebida.id)).status, 400);
  });

  it("T9: falha forçada no UPDATE das etapas não derruba upload nem pipeline; o marco seguinte recupera (catch-up)", async () => {
    // Só o 1º UPDATE em etapas (marco 1, no upload) falha de verdade no banco: coluna inexistente.
    let falhasRestantes = 1;
    supabase.from = function (tabela) {
      const consulta = originalFrom.call(this, tabela);
      if (tabela === "etapas" && falhasRestantes > 0) {
        const updateOriginal = consulta.update.bind(consulta);
        consulta.update = campos => {
          falhasRestantes -= 1;
          return updateOriginal({ ...campos, coluna_que_nao_existe_748: true });
        };
      }
      return consulta;
    };

    const id = await enviar(tokenA);
    const processo = await processoDoMes(A.id, "2026-10-01");
    assert.equal(falhasRestantes, 0, "a falha precisa ter sido injetada no marco 1");
    assert.deepEqual(await concluidas(processo.id), ESTADO_INICIAL);

    const final = await esperarPipeline(id);
    assert.equal(final.status, "concluido");
    assert.equal(final.saida_status, "ok");
    await esperarEstado(processo.id, [true, true, true, false, false, false]);
  });

  it("T10: com as manuais já clicadas, o pipeline conclui as automáticas e fecha o processo", async () => {
    const criado = await criarProcessoPelaRota("2026-10");
    for (const etapa of criado.etapas.filter(e => e.tipo === "manual")) {
      assert.equal((await clicar(criado.id, etapa.id)).status, 200);
    }

    await esperarPipeline(await enviar(tokenA));
    await esperarEstado(criado.id, [true, true, true, true, true, true]);
    const processo = await esperar("processo concluído",
      () => processoDoMes(A.id, "2026-10-01"), p => p.status === "concluido");
    assert.equal(processo.id, criado.id);
  });

  it("T11: POST /processos de folha sem mês cria com o mês atual; de novo, 409; mês inválido, 400", async () => {
    const atual = mesReferenciaAtual();
    const primeiro = await api.requisitar("/processos", { usuario: usuarioA, metodo: "POST", corpo: { tipo: "folha_pagamento" } });
    assert.equal(primeiro.status, 201, JSON.stringify(primeiro.corpo));
    assert.equal(primeiro.corpo.mes_referencia, atual);
    assert.equal(primeiro.corpo.etapas.length, 6);

    const segundo = await api.requisitar("/processos", { usuario: usuarioA, metodo: "POST", corpo: { tipo: "folha_pagamento" } });
    assert.equal(segundo.status, 409);
    const [ano, mes] = atual.split("-");
    assert.deepEqual(segundo.corpo, { erro: `Já existe o processo da folha de ${mes}/${ano}` });

    for (const invalido of ["2026-13", "10/2026", 202610]) {
      const resposta = await api.requisitar("/processos", {
        usuario: usuarioA, metodo: "POST", corpo: { tipo: "folha_pagamento", mes_referencia: invalido },
      });
      assert.equal(resposta.status, 400, String(invalido));
    }

    const processos = await processosFolha();
    assert.equal(processos.length, 1);
    assert.equal(processos[0].mes_referencia, atual);
  });

  // Estado que o criador antigo podia deixar: o processo gravado e o INSERT das etapas falhado.
  async function criarProcessoLegadoSemEtapas(mes) {
    const { data, error } = await banco.from("processos")
      .insert({ cliente_id: A.id, tipo: "folha_pagamento", mes_referencia: mes })
      .select().single();
    assert.equal(error, null, error?.message);
    assert.deepEqual(await etapas(data.id), []);
    return data;
  }

  it("T13: processo legado do mês sem etapas: o upload recupera as 6, conclui 1, 2 e 3 e segue 1 só processo no mês", async () => {
    const legado = await criarProcessoLegadoSemEtapas("2026-10-01");
    const outroMes = await criarProcessoLegadoSemEtapas("2026-09-01");

    await esperarPipeline(await enviar(tokenA));
    await esperarEstado(legado.id, [true, true, true, false, false, false]);

    const processo = await processoDoMes(A.id, "2026-10-01");
    assert.equal(processo.id, legado.id);
    assert.equal((await processosFolha()).length, 2);
    const recuperadas = await etapas(legado.id);
    assert.deepEqual(recuperadas.map(e => e.ordem), [1, 2, 3, 4, 5, 6]);
    assert.deepEqual(recuperadas.map(e => e.tipo), [
      "automatizada", "automatizada", "automatizada", "manual", "manual", "manual",
    ]);
    // Outro mês, mesmo escritório: o upload de outubro não mexe nele.
    assert.deepEqual(await etapas(outroMes.id), []);

    // Reenvio: não duplica etapa nem processo e não retrocede.
    await esperarPipeline(await enviar(tokenA));
    assert.deepEqual((await etapas(legado.id)).map(e => [e.id, e.concluida]),
      recuperadas.map((e, i) => [e.id, i < 3]));
    assert.equal((await processosFolha()).length, 2);
  });

  it("T14: uploads em paralelo sobre o processo legado sem etapas recuperam 6 etapas, sem duplicar", async () => {
    const legado = await criarProcessoLegadoSemEtapas("2026-10-01");

    const ids = await Promise.all([enviar(tokenA), enviar(tokenA), enviar(tokenA)]);
    await Promise.all(ids.map(esperarPipeline));

    await esperarEstado(legado.id, [true, true, true, false, false, false]);
    assert.deepEqual((await etapas(legado.id)).map(e => e.ordem), [1, 2, 3, 4, 5, 6]);
    assert.equal((await processosFolha()).length, 1);
  });

  it("T15: POST /processos de folha sobre o processo legado sem etapas devolve 409 e recupera as 6 etapas", async () => {
    const legado = await criarProcessoLegadoSemEtapas("2026-10-01");

    const resposta = await api.requisitar("/processos", {
      usuario: usuarioA, metodo: "POST", corpo: { tipo: "folha_pagamento", mes_referencia: "2026-10" },
    });

    assert.equal(resposta.status, 409, JSON.stringify(resposta.corpo));
    assert.deepEqual(await concluidas(legado.id), ESTADO_INICIAL);
    assert.equal((await processosFolha()).length, 1);
  });

  it("T16: o job do dia 1 não cria processo novo sobre o legado sem etapas; o upload do mês o recupera", async () => {
    const legado = await criarProcessoLegadoSemEtapas("2026-10-01");

    assert.deepEqual(await gerarFolhaMensal(new Date(2026, 9, 1, 3, 0, 0)), { criados: 1, erros: 0, jaExistiam: 1 });
    assert.equal((await processosFolha()).length, 1);
    assert.deepEqual(await etapas(legado.id), []);

    await esperarPipeline(await enviar(tokenA));
    await esperarEstado(legado.id, [true, true, true, false, false, false]);
  });

  it("T12: o job do dia 1 rodado duas vezes e depois de um upload não duplica e conta \"já existia\"", async () => {
    const outubro = new Date(2026, 9, 1, 3, 0, 0);
    assert.deepEqual(await gerarFolhaMensal(outubro), { criados: 2, erros: 0, jaExistiam: 0 });
    assert.deepEqual(await gerarFolhaMensal(outubro), { criados: 0, erros: 0, jaExistiam: 2 });

    // Novembro: o upload do A chega antes do job.
    await esperarPipeline(await enviar(tokenA, { mes: "2026-11" }));
    assert.deepEqual(await gerarFolhaMensal(new Date(2026, 10, 1, 3, 0, 0)), { criados: 1, erros: 0, jaExistiam: 1 });

    const meses = clienteId => processosFolha(clienteId).then(lista => lista.map(p => p.mes_referencia).sort());
    assert.deepEqual(await meses(A.id), ["2026-10-01", "2026-11-01"]);
    assert.deepEqual(await meses(B.id), ["2026-10-01", "2026-11-01"]);
    for (const processo of [...await processosFolha(A.id), ...await processosFolha(B.id)]) {
      assert.equal((await etapas(processo.id)).length, 6);
    }
  });
});
