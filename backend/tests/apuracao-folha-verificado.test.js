// DAS-3 (#727, PRB-AP-15): "verificado" nunca convive com folha que barra a
// aprovação, "aprovado" nunca fica "pendente", e o 409 FOLHA_PENDENTE (da
// aprovação, do recálculo e o bloqueio_folha do GET) diz qual folha e de quais
// meses, no contrato do #738 ({ erro, motivo, mesesPendentes }).
// HTTP, JWT, licença, PostgreSQL, storage, pipeline e worker do agente reais;
// só a massa é sintética (cliente "QA-F regressão <uuid>", CPF de teste).
//
// Números (conta manual, não do código): receita de R$ 10.000,00 por mês nos
// 12 meses anteriores → RBT12 = 120.000,00 (LC 123, art. 18 §1º). Folha de
// R$ 5.000,00 por mês → FS12 = 60.000,00 (planilha pelo pipeline: + FGTS 8% =
// 5.400,00/mês → 64.800,00; Res. CGSN 140/2018, art. 26 §1º, sem a CPP, que é
// a DAS-6). Fator R 0,50 ou 0,54 ≥ 0,28 → Anexo III, 1ª faixa (até 180.000,00:
// 6%, sem parcela a deduzir) → DAS = 10.000,00 × 6% = R$ 600,00. Sem a folha:
// Anexo V, 1ª faixa, 15,5% → R$ 1.550,00.
import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { aguardar, calculo, iniciarCenarioApuracao, inserir, lerTodos, REFERENCIAS, refISO, relatorio } from "./helpers/apuracao-qa-f.js";
import { LINHAS_FLOAT } from "./fixtures/folha-soma-float.js";
import { comStorageDescartavel } from "./helpers/servicos-externos.js";
import { dispararPipelineAutomatico } from "../src/controllers/folha.controller.js";
import { COLUNAS_FOLHA, COLUNA_CATEGORIA } from "../src/services/folha.service.js";

// Motivos do 409 FOLHA_PENDENTE (#738 e DAS-3), copiados do contrato.
const EM_PROCESSAMENTO = "A folha ainda aguarda confirmação ou processamento.";
// Falha de envio: sai num relatório do agente que traga o mês sem falha ou com
// uma planilha nova do mês, criada depois da falha (do agente, do watcher ou da
// tela), então o motivo oferece os dois caminhos. Falha sem mês da janela (linha
// antiga): não há mês a substituir pela tela, só o agente a resolve.
const falhaEnvio = meses => meses.length
  ? `O agente não conseguiu enviar a planilha destes meses. Corrija ou recoloque o arquivo ${meses.length > 1 ? "nas pastas" : "na pasta"} ${meses.map(m => `Folha/${m}`).join(", ")} do computador do escritório, ou envie a planilha certa pela tela de Folha.`
  : "O agente não conseguiu enviar arquivos de folha. Corrija ou recoloque os arquivos na pasta Folha do computador do escritório para o agente reenviá-los na próxima verificação.";
const ERRO_PROCESSAMENTO = "Folha com erro no processamento; corrija a planilha e envie de novo pela tela de Folha.";
const NAO_RECEBIDA = "Folha encontrada pelo agente que não chegou ao sistema; envie a planilha pela tela de Folha.";
const RECALCULAR = "Este DAS foi calculado com outra folha; use Recalcular para refazê-lo (mês sem folha conta como zero).";
const ref = r => refISO(r).slice(0, 7);
const folhaPendente = (motivo, meses = []) => ({
  erro: "FOLHA_PENDENTE",
  motivo: meses.length ? `${motivo} Meses pendentes: ${meses.join(", ")}.` : motivo,
  mesesPendentes: meses,
});
// Várias situações ao mesmo tempo: cada motivo com os seus meses, na ordem
// falha de envio, erro, processamento, planilha não recebida.
const folhaPendenteVarias = (...situacoes) => ({
  erro: "FOLHA_PENDENTE",
  motivo: situacoes.map(([motivo, meses]) => `${motivo} Meses pendentes: ${meses.join(", ")}.`).join(" "),
  mesesPendentes: situacoes.flatMap(([, meses]) => meses).sort(),
});

const caminho = a => `/apuracoes/${a.id}`;
const acao = (s, a, nome) => s.chamar(`${caminho(a)}/${nome}`, { metodo: "PATCH", corpo: {} });
const naFila = async (s, c, a) => {
  const r = await s.chamar("/apuracoes/folha-pendente", { usuario: null, cabecalhos: { "x-licenca-token": c.licenca } });
  assert.equal(r.status, 200);
  return r.corpo.some(item => item.id === a.id);
};
const mesesDaFila = async (s, c, a) => {
  const r = await s.chamar("/apuracoes/folha-pendente", { usuario: null, cabecalhos: { "x-licenca-token": c.licenca } });
  assert.equal(r.status, 200);
  return r.corpo.find(item => item.id === a.id)?.mesesFolha;
};
// Sem relatório do agente a apuração não entra na fila (mês sem folha vale
// zero, #737; folha recebida e não concluída já está no backend). O 1º ciclo
// do agente real recebe o item como a fila o daria para a janela inteira; os
// seguintes, depois de uma falha de envio, vêm da fila.
const itemDaFila = (c, a) => ({ id: a.id, clienteId: c.id, nomeEmpresa: c.nome, mes: a.periodo_mes, ano: a.periodo_ano, mesesFolha: REFERENCIAS });

// Toda leitura da apuração diz a mesma coisa que a aprovação (e, quando o
// recálculo também precisa esperar, ele devolve o mesmo corpo).
async function conferirBloqueio(s, c, a, esperado, rotulo, { recalculo = false } = {}) {
  const get = await s.chamar(caminho(a)), lista = await s.chamar(`/apuracoes?clienteId=${c.id}`);
  assert.equal(get.status, 200);
  assert.equal(lista.status, 200);
  const item = lista.corpo.find(x => x.id === a.id);
  for (const [origem, linha] of [["GET /:id", get.corpo], ["GET lista", item]]) {
    assert.notEqual(linha.folha_status, "verificado", `${rotulo}: ${origem} não diz verificado com a aprovação barrada`);
    assert.equal(linha.folha_status, "pendente", `${rotulo}: ${origem}`);
  }
  assert.deepEqual(get.corpo.bloqueio_folha, esperado, `${rotulo}: detalhe mostra o motivo da aprovação`);
  const aprovar = await acao(s, a, "aprovar");
  assert.equal(aprovar.status, 409, rotulo);
  assert.deepEqual(aprovar.corpo, esperado, `${rotulo}: 409 diz qual folha e de quais meses`);
  if (recalculo) {
    const recalcular = await acao(s, a, "recalcular");
    assert.equal(recalcular.status, 409, `${rotulo}: recálculo espera a folha`);
    assert.deepEqual(recalcular.corpo, esperado, `${rotulo}: recálculo e aprovação dão a mesma resposta`);
  }
  assert.equal((await s.estado(a)).status, "rascunho");
}

const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Cabeçalho completo (o upload aceita); "cargo" vazio reprova no cálculo.
async function planilha(c, { salario = 5000, cargo = "QA" } = {}) {
  const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet("Folha");
  sheet.columns = [...COLUNAS_FOLHA, COLUNA_CATEGORIA];
  sheet.addRow({ empresa: c.nome, funcionario: "Empregado QA-F", cpf: "52998224725", cargo, salario_bruto: salario, dias_trabalhados: 30, horas_extras: 0, faltas: 0, adiantamento: 0, num_dependentes: 0, vale_transporte: "NAO", categoria: "EMPREGADO" });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// Mesma rota que o agente usa (POST /folha/upload/agente): grava o
// processamento "pendente" e dispara o pipeline em segundo plano.
async function enviarPlanilha(s, c, mes, arquivo) {
  await s.prepararStorage();
  const formulario = new FormData();
  formulario.append("planilha", new Blob([arquivo], { type: MIME_XLSX }), "folha.xlsx");
  formulario.append("mes_referencia", mes);
  const r = await s.chamar("/folha/upload/agente", { usuario: null, metodo: "POST", formulario, cabecalhos: { "x-licenca-token": c.licenca } });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  return r.corpo.processamento_id;
}

const lerProcessamento = async (s, id) => {
  const r = await s.banco.from("processamentos_folha").select("status, saida_status").eq("id", id).single();
  assert.ifError(r.error);
  return r.data;
};

// Barreiras no transporte (sem fabricar resposta): seguram a reivindicação do
// processamento pelo pipeline (UPDATE para "processando") e o download da
// planilha do cliente, até o teste liberar.
function barreiras(t, c) {
  const original = globalThis.fetch;
  const portao = () => {
    const p = {};
    p.chegada = new Promise(resolve => { p.chegou = resolve; });
    p.aberto = new Promise(resolve => { p.liberar = resolve; });
    return p;
  };
  const reivindicacao = portao(), download = portao();
  globalThis.fetch = async (entrada, opcoes) => {
    const url = new URL(typeof entrada === "string" || entrada instanceof URL ? entrada : entrada.url);
    const metodo = opcoes?.method ?? entrada.method ?? "GET";
    const alvo = metodo === "PATCH" && url.pathname === "/rest/v1/processamentos_folha" && String(opcoes?.body).includes('"processando"')
      ? reivindicacao
      : metodo === "GET" && url.pathname.startsWith("/storage/v1/object/") && decodeURIComponent(url.pathname).includes(`clientes/${c.id}/`)
        ? download : null;
    if (alvo) { alvo.chegou(url.href); await alvo.aberto; }
    return original(entrada, opcoes);
  };
  const restaurar = () => { globalThis.fetch = original; reivindicacao.liberar(); download.liberar(); };
  t.after(restaurar);
  return { reivindicacao, download, restaurar };
}

test("DAS-3 PRB-AP-15: report temDozeMeses com folha em processamento não vira verificado, explica os meses, sai da fila sem reenvio e verifica ao concluir", { timeout: 180_000 }, async t => {
  const s = await iniciarCenarioApuracao(t), c = await s.cliente(); await s.notas(c);
  const a = await s.criar(c);
  const ps = []; for (const r of REFERENCIAS) ps.push(await s.pendente(c, refISO(r)));

  const report = await s.reportar(c, a, relatorio());
  assert.equal(report.status, 200);
  assert.equal(report.corpo.folha_status, "pendente", "o agente achou as 12 pastas, mas a folha ainda não está calculada");
  const esperado = folhaPendente(EM_PROCESSAMENTO, REFERENCIAS.map(ref));
  await conferirBloqueio(s, c, a, esperado, "folha em processamento", { recalculo: true });

  // Causa 4: o backend já recebeu as planilhas. Um novo ciclo do agente real
  // (pastas com as 12 planilhas) não pode reenviá-las.
  assert.equal(await naFila(s, c, a), false, "folha recebida e em processamento sai da fila do agente");
  await s.worker(c);
  assert.equal((await lerTodos(s.banco, "processamentos_folha", { cliente_id: c.id })).length, 12, "nenhum reenvio");

  await comStorageDescartavel(() => Promise.all(ps.map(p => dispararPipelineAutomatico(p.id))));
  await s.concluidos(c);
  const get = await s.chamar(caminho(a));
  assert.equal(get.status, 200);
  for (const [campo, valor] of Object.entries({ folha_status: "verificado", folha12: 64800, fator_r: .54, anexo: "III", valor_calculado: 600, bloqueio_folha: null })) {
    assert.deepEqual(get.corpo[campo], valor, `após o pipeline: ${campo}`);
  }
  const aprovado = await acao(s, a, "aprovar");
  assert.equal(aprovado.status, 200);
  assert.equal(aprovado.corpo.status, "aprovado");
});

test("DAS-3 verificado e depois uma folha nova com erro no pipeline real: a API deixa de dizer verificado e o reenvio corrigido volta a verificar", { timeout: 120_000 }, async t => {
  const s = await iniciarCenarioApuracao(t), c = await s.cliente(); await s.notas(c);
  for (const r of REFERENCIAS) await s.processo(c, refISO(r), 5000);
  const a = await s.criar(c);
  assert.equal(a.folha_status, "verificado"); assert.equal(a.valor_calculado, 600); assert.equal(a.bloqueio_folha, null);

  // A planilha de 09/2026 é substituída, pela rota de upload, por uma que o
  // cálculo reprova.
  const ruim = await enviarPlanilha(s, c, "2026-09", await planilha(c, { cargo: "" }));
  await aguardar(async () => (await lerProcessamento(s, ruim)).status === "erro", "erro do pipeline");
  const esperado = folhaPendente(ERRO_PROCESSAMENTO, ["2026-09"]);
  assert.equal((await s.estado(a)).folha_status, "pendente", "o erro do pipeline chega à apuração gravada");
  await conferirBloqueio(s, c, a, esperado, "folha com erro", { recalculo: true });
  assert.equal(await naFila(s, c, a), false, "erro de processamento não chama o agente para reenviar em loop");

  // Planilha corrigida (R$ 6.000,00 + FGTS 480,00): FS12 = 11 × 5.000 + 6.480 =
  // 61.480,00; Fator R 61.480 / 120.000 = 0,5123 → 0,51 → Anexo III → R$ 600,00.
  const boa = await s.pendente(c, "2026-09-01", 6000);
  await comStorageDescartavel(() => dispararPipelineAutomatico(boa.id));
  const get = await s.chamar(caminho(a));
  for (const [campo, valor] of Object.entries({ folha_status: "verificado", folha12: 61480, fator_r: .51, anexo: "III", valor_calculado: 600, bloqueio_folha: null })) {
    assert.deepEqual(get.corpo[campo], valor, `após a correção: ${campo}`);
  }
  assert.equal((await acao(s, a, "aprovar")).status, 200);
});

// Folha nova enviada pela rota de upload: o processamento nasce "pendente" e o
// pipeline pega a linha depois (ou não pega, se o backend cair ou a
// reivindicação falhar). Para a apuração, pendente, processando e erro são a
// mesma situação: nenhuma rota diz "verificado" antes de a folha concluir.
test("DAS-3 folha nova enviada pela rota de upload, antes de o pipeline pegar a linha: GET, lista, PATCH, aprovação e recálculo não dizem verificado", { timeout: 120_000 }, async t => {
  const s = await iniciarCenarioApuracao(t), c = await s.cliente(); await s.notas(c);
  for (const r of REFERENCIAS) await s.processo(c, refISO(r), 5000);
  const a = await s.criar(c);
  assert.equal(a.folha_status, "verificado"); assert.equal(a.valor_calculado, 600); assert.equal(a.bloqueio_folha, null);

  const portoes = barreiras(t, c);
  const id = await enviarPlanilha(s, c, "2026-09", await planilha(c, { salario: 6000 }));
  assert.ok((await portoes.reivindicacao.chegada).includes(id), "o pipeline está parado antes de reivindicar a linha");
  assert.equal((await lerProcessamento(s, id)).status, "pendente");
  const esperado = folhaPendente(EM_PROCESSAMENTO, ["2026-09"]);
  await conferirBloqueio(s, c, a, esperado, "upload sem o pipeline", { recalculo: true });
  const editado = await s.chamar(caminho(a), { metodo: "PATCH", corpo: { valor_editado: 1500, motivo: "Conferência DAS-3" } });
  assert.equal(editado.status, 200);
  assert.equal(editado.corpo.folha_status, "pendente", "PATCH não diz verificado");
  assert.equal((await s.estado(a)).folha_status, "pendente", "o upload já tira a apuração gravada de verificado");
  assert.equal(await naFila(s, c, a), false, "o backend já tem a planilha: o agente não é chamado");

  // O pipeline reivindica a linha ("processando") e para no download.
  portoes.reivindicacao.liberar();
  await portoes.download.chegada;
  assert.equal((await lerProcessamento(s, id)).status, "processando");
  assert.equal((await s.estado(a)).folha_status, "pendente");
  const lista = await s.chamar(`/apuracoes?clienteId=${c.id}`);
  assert.equal(lista.corpo.find(x => x.id === a.id).folha_status, "pendente", "a lista não diz verificado durante o processamento");

  // Planilha de R$ 6.000,00 + FGTS 480,00: FS12 = 11 × 5.000 + 6.480 =
  // 61.480,00; Fator R 61.480 / 120.000 = 0,5123 → 0,51 → Anexo III → R$ 600,00.
  portoes.download.liberar();
  await aguardar(async () => { const p = await lerProcessamento(s, id); return p.status === "concluido" && p.saida_status !== "pendente"; }, "fim do pipeline");
  portoes.restaurar();
  const get = await s.chamar(caminho(a));
  // Sem relatório do agente, dados_folha volta a null e a apuração segue a regra
  // do #737 (mês ausente vale zero e é aprovável).
  for (const [campo, valor] of Object.entries({ folha_status: "verificado", folha12: 61480, fator_r: .51, anexo: "III", valor_calculado: 600, bloqueio_folha: null, dados_folha: null })) {
    assert.deepEqual(get.corpo[campo], valor, `após o pipeline: ${campo}`);
  }
  assert.equal((await acao(s, a, "aprovar")).status, 200);
});

// dados_folha é o relatório do agente (a tela lê dele "N/12 meses encontrados
// pelo agente"). Sem relatório, a 1ª planilha enviada pela tela deixa a
// apuração pendente pela folha viva, sem gravar em dados_folha nada com cara de
// relatório, e a fila e o 409 continuam certos.
test("DAS-3 sem relatório do agente, a 1ª planilha pela tela em processamento: dados_folha segue null, o 409 diz o mês e o agente não é chamado", { timeout: 120_000 }, async t => {
  const s = await iniciarCenarioApuracao(t), c = await s.cliente(); await s.notas(c);
  const a = await s.criar(c);
  assert.equal(a.folha_status, "verificado"); assert.equal(a.dados_folha, null); assert.equal(a.bloqueio_folha, null);

  const portoes = barreiras(t, c);
  await s.prepararStorage();
  const formulario = new FormData();
  formulario.append("planilha", new Blob([await planilha(c)], { type: MIME_XLSX }), "folha.xlsx");
  formulario.append("mes_referencia", "2026-09");
  const envio = await s.chamar(`/folha/upload?clienteId=${c.id}`, { metodo: "POST", formulario });
  assert.equal(envio.status, 201, JSON.stringify(envio.corpo));
  assert.ok((await portoes.reivindicacao.chegada).includes(envio.corpo.processamento_id), "o pipeline está parado antes de reivindicar a linha");

  const gravado = await s.estado(a);
  assert.equal(gravado.folha_status, "pendente", "a planilha recebida tira a apuração de verificado");
  assert.equal(gravado.dados_folha, null, "sem relatório do agente, nada é gravado em dados_folha");
  const get = await s.chamar(caminho(a));
  assert.equal(get.corpo.dados_folha, null, "o GET não devolve relatório que o agente não fez");
  await conferirBloqueio(s, c, a, folhaPendente(EM_PROCESSAMENTO, ["2026-09"]), "1ª planilha pela tela", { recalculo: true });
  assert.equal(await naFila(s, c, a), false, "o backend já tem a planilha: o agente não é chamado");

  // Planilha de R$ 5.000,00 + FGTS 8% = 5.400,00 só em 09/2026 (os outros 11
  // meses sem folha valem zero, #726): FS12 = 5.400,00; Fator R 5.400 /
  // 120.000 = 0,045 < 0,28 → Anexo V, 1ª faixa, 15,5% → R$ 1.550,00.
  portoes.restaurar();
  await aguardar(async () => { const p = await lerProcessamento(s, envio.corpo.processamento_id); return p.status === "concluido" && p.saida_status !== "pendente"; }, "fim do pipeline");
  const concluido = await s.chamar(caminho(a));
  for (const [campo, valor] of Object.entries({ folha_status: "verificado", folha12: 5400, anexo: "V", valor_calculado: 1550, bloqueio_folha: null, dados_folha: null })) {
    assert.deepEqual(concluido.corpo[campo], valor, `após o pipeline: ${campo}`);
  }
});

// A reconciliação da apuração no upload é secundária: se ela falhar (aqui, a
// leitura das apurações cai na rede), a planilha continua aceita, sem
// duplicar o processamento, e o pipeline segue e reconcilia no fim.
test("DAS-3 upload responde 201 mesmo com a reconciliação da apuração falhando: um processamento e o pipeline segue", { timeout: 120_000 }, async t => {
  const s = await iniciarCenarioApuracao(t), c = await s.cliente(); await s.notas(c);
  for (const r of REFERENCIAS) await s.processo(c, refISO(r), 5000);
  const a = await s.criar(c);
  // Enquanto o upload responde, toda leitura das apurações do cliente cai (a
  // conexão é interrompida; o cliente do banco não repete conexão abortada).
  const original = globalThis.fetch;
  let falhas = 0;
  let ativo = true;
  globalThis.fetch = async (entrada, opcoes) => {
    const url = new URL(typeof entrada === "string" || entrada instanceof URL ? entrada : entrada.url);
    if (ativo && (opcoes?.method ?? "GET") === "GET" && url.pathname === "/rest/v1/apuracoes" &&
      url.searchParams.get("cliente_id") === `eq.${c.id}`) {
      falhas += 1;
      const queda = new Error("conexão interrompida");
      queda.name = "AbortError";
      throw queda;
    }
    return original(entrada, opcoes);
  };
  t.after(() => { globalThis.fetch = original; });
  const id = await enviarPlanilha(s, c, "2026-09", await planilha(c, { salario: 6000 }));
  ativo = false;
  globalThis.fetch = original;
  assert.ok(falhas > 0, "a reconciliação do upload falhou");
  const processos = await lerTodos(s.banco, "processamentos_folha", { cliente_id: c.id });
  assert.equal(processos.length, 13, "um processamento novo, sem duplicar");
  await aguardar(async () => { const p = await lerProcessamento(s, id); return p.status === "concluido" && p.saida_status !== "pendente"; }, "fim do pipeline");
  // O gancho do fim do pipeline reconcilia: FS12 = 11 × 5.000 + 6.480 = 61.480.
  const get = await s.chamar(caminho(a));
  for (const [campo, valor] of Object.entries({ folha_status: "verificado", folha12: 61480, fator_r: .51, anexo: "III", valor_calculado: 600 })) {
    assert.deepEqual(get.corpo[campo], valor, `após o pipeline: ${campo}`);
  }
});

// Folha concluída que mudou depois do cálculo sem passar pelos ganchos (gravada
// direto no banco, como se o gancho do fim do pipeline tivesse falhado): a
// leitura e a aprovação comparam a FS12 viva com a gravada.
test("DAS-3 folha concluída mudou depois do cálculo: o detalhe manda recalcular, a aprovação dá 409 e o recálculo usa a FS12 nova", async t => {
  const s = await iniciarCenarioApuracao(t), c = await s.cliente(); await s.notas(c);
  for (const r of REFERENCIAS) await s.processo(c, refISO(r), 5000);
  // FS12 = 12 × 5.000 = 60.000 (fixture sem FGTS); Fator R 0,50 → Anexo III.
  const a = await s.criar(c);
  for (const [campo, valor] of Object.entries({ folha_status: "verificado", folha12: 60000, fator_r: .5, anexo: "III", valor_calculado: 600 })) {
    assert.deepEqual(a[campo], valor, `POST: ${campo}`);
  }
  // 09/2026, outra janela (09/2025 a 08/2026): FS12 = 11 × 5.000 = 55.000.
  const setembro = await s.criar(c, 9);
  assert.equal(setembro.folha12, 55000); assert.equal(setembro.folha_status, "verificado");
  await s.processo(c, "2026-09-01", 11000, { criado_em: new Date(Date.now() + 60_000).toISOString() });
  assert.equal((await s.estado(a)).folha_status, "verificado", "nenhum gancho rodou");
  // A lista avalia cada linha na sua janela: a folha nova de 09/2026 não muda
  // a apuração de 09/2026, que continua verificada.
  const listaSetembro = await s.chamar(`/apuracoes?clienteId=${c.id}`);
  assert.equal(listaSetembro.corpo.find(x => x.id === setembro.id).folha_status, "verificado");

  // GET, lista, aprovação e PATCH: nenhuma rota diz "verificado".
  await conferirBloqueio(s, c, a, folhaPendente(RECALCULAR), "folha mudada");
  const editado = await s.chamar(caminho(a), { metodo: "PATCH", corpo: { valor_editado: 650, motivo: "Conferência DAS-3" } });
  assert.equal(editado.status, 200);
  assert.equal(editado.corpo.folha_status, "pendente", "PATCH não diz verificado com a folha mudada");

  // FS12 nova = 11 × 5.000 + 11.000 = 66.000; Fator R 66.000 / 120.000 = 0,55
  // ≥ 0,28 → Anexo III (LC 123/2006, art. 18 §5º-J; Res. CGSN 140/2018,
  // art. 26), 1ª faixa 6% → 10.000,00 × 6% = R$ 600,00.
  const recalc = await acao(s, a, "recalcular");
  assert.equal(recalc.status, 200);
  for (const [campo, valor] of Object.entries({ folha_status: "verificado", folha12: 66000, fator_r: .55, anexo: "III", valor_calculado: 600, bloqueio_folha: null })) {
    assert.deepEqual(recalc.corpo[campo], valor, `recálculo: ${campo}`);
  }
  assert.equal((await acao(s, a, "aprovar")).status, 200);
});

// Linha gravada "verificado" (sem relatório) quando a folha mais nova do mês
// está em erro ou processando sem que o gancho tenha rodado: lista e PATCH
// conferem a folha viva, como o GET e a aprovação.
test("DAS-3 linha verificada com a folha nova em erro ou processando: GET, lista, PATCH e aprovação não dizem verificado", async t => {
  const s = await iniciarCenarioApuracao(t);
  for (const [status, motivo] of [["erro", ERRO_PROCESSAMENTO], ["processando", EM_PROCESSAMENTO]]) {
    const c = await s.cliente(); await s.notas(c);
    for (const r of REFERENCIAS) await s.processo(c, refISO(r), 5000);
    const a = await s.criar(c);
    assert.equal(a.folha_status, "verificado", status);
    await s.processo(c, "2026-08-01", 0, { status, criado_em: new Date(Date.now() + 60_000).toISOString() });
    assert.equal((await s.estado(a)).folha_status, "verificado", `${status}: nenhum gancho rodou`);
    await conferirBloqueio(s, c, a, folhaPendente(motivo, ["2026-08"]), `folha ${status}`, { recalculo: true });
    const editado = await s.chamar(caminho(a), { metodo: "PATCH", corpo: { valor_editado: 650, motivo: "Conferência DAS-3" } });
    assert.equal(editado.status, 200);
    assert.equal(editado.corpo.folha_status, "pendente", `${status}: PATCH não diz verificado`);
  }
});

// Estado do QA-F de 12/10 (item 4): o agente antigo varria 11/2025 a 10/2026
// (o próprio PA) e o report só trocava o status, sem FS12.
async function linhaAntigaVerificada(s, c, { comFolha = true } = {}) {
  if (comFolha) for (const r of REFERENCIAS) await s.processo(c, refISO(r), 5000);
  const a = await s.criar(c);
  const antigo = Array.from({ length: 12 }, (_, i) => { const n = 2025 * 12 + 10 + i; return { ano: Math.floor(n / 12), mes: n % 12 + 1 }; });
  const r = await s.banco.from("apuracoes").update({ anexo: "V", fator_r: 0, folha12: null, valor_calculado: 1550, aliquota_efetiva: .155,
    folha_status: "verificado", dados_folha: { temDozeMeses: true, mesesEncontrados: antigo, totalMesesEncontrados: 12 } }).eq("id", a.id);
  assert.ifError(r.error);
  return a;
}

test("DAS-3 linha antiga (report só marcava verificado, sem FS12): nenhuma rota diz verificado, o 409 manda recalcular e o recálculo resolve", async t => {
  const s = await iniciarCenarioApuracao(t), c = await s.cliente(); await s.notas(c);
  const a = await linhaAntigaVerificada(s, c);
  await conferirBloqueio(s, c, a, folhaPendente(RECALCULAR), "linha antiga");
  const editado = await s.chamar(caminho(a), { metodo: "PATCH", corpo: { valor_editado: 1500, motivo: "Conferência DAS-3" } });
  assert.equal(editado.status, 200);
  assert.equal(editado.corpo.folha_status, "pendente", "PATCH também não diz verificado");

  const recalc = await acao(s, a, "recalcular");
  assert.equal(recalc.status, 200, "o mês fora da janela do relatório antigo não trava o recálculo");
  for (const [campo, valor] of Object.entries({ folha_status: "verificado", folha12: 60000, fator_r: .5, anexo: "III", valor_calculado: 600, bloqueio_folha: null })) {
    assert.deepEqual(recalc.corpo[campo], valor, `recálculo: ${campo}`);
  }
  assert.equal((await acao(s, a, "aprovar")).status, 200);
});

test("DAS-3 linha antiga também se resolve sozinha quando uma folha da janela termina de processar", { timeout: 60_000 }, async t => {
  const s = await iniciarCenarioApuracao(t), c = await s.cliente(); await s.notas(c);
  const a = await linhaAntigaVerificada(s, c);
  // 09/2026 reprocessada com R$ 6.000,00 + FGTS 480,00: FS12 = 61.480,00 →
  // Fator R 0,51 → Anexo III → R$ 600,00. O 10/2026 do relatório antigo está
  // fora da janela e não pode deixar a apuração pendente para sempre.
  const nova = await s.pendente(c, "2026-09-01", 6000);
  await comStorageDescartavel(() => dispararPipelineAutomatico(nova.id));
  const get = await s.chamar(caminho(a));
  for (const [campo, valor] of Object.entries({ folha_status: "verificado", folha12: 61480, fator_r: .51, anexo: "III", valor_calculado: 600, bloqueio_folha: null })) {
    assert.deepEqual(get.corpo[campo], valor, `após o pipeline: ${campo}`);
  }
  assert.equal((await acao(s, a, "aprovar")).status, 200);
});

test("DAS-3 linha antiga cujas planilhas nunca chegaram: aprovação e recálculo dizem quais meses enviar", async t => {
  const s = await iniciarCenarioApuracao(t), c = await s.cliente(); await s.notas(c);
  const a = await linhaAntigaVerificada(s, c, { comFolha: false });
  // O agente antigo relatou 11/2025 a 10/2026; 10/2026 é o próprio PA (fora da
  // janela). Os 11 meses da janela foram achados e não estão no sistema.
  await conferirBloqueio(s, c, a, folhaPendente(NAO_RECEBIDA, REFERENCIAS.slice(1).map(ref)),
    "linha antiga sem planilhas", { recalculo: true });
});

test("DAS-3 motivo legível também para falha de envio e folha não recebida", async t => {
  const s = await iniciarCenarioApuracao(t);

  const falha = await s.cliente(); await s.notas(falha);
  const af = await s.criar(falha);
  const ultimos = REFERENCIAS.slice(9);
  assert.equal((await s.reportar(falha, af, relatorio(ultimos, { falhaUpload: true }))).status, 200);
  await conferirBloqueio(s, falha, af, folhaPendente(falhaEnvio(ultimos.map(ref)), ultimos.map(ref)), "falha de envio", { recalculo: true });
  assert.equal(await naFila(s, falha, af), true, "falha de envio continua na fila para nova tentativa");

  // Agente antigo (sem falhaUpload) relatou 09/2026, mas a planilha não chegou.
  const perdida = await s.cliente(); await s.notas(perdida);
  const ap = await s.criar(perdida);
  assert.equal((await s.reportar(perdida, ap, relatorio([{ ano: 2026, mes: 9 }]))).status, 200);
  await conferirBloqueio(s, perdida, ap, folhaPendente(NAO_RECEBIDA, ["2026-09"]), "folha não recebida", { recalculo: true });

  // Planilha nova de um mês que já tinha folha concluída: o envio falhou, então
  // o mês continua listado (a folha que vale ainda não é a do agente).
  const reenvio = await s.cliente(); await s.notas(reenvio);
  for (const r of REFERENCIAS) await s.processo(reenvio, refISO(r), 5000);
  const ar = await s.criar(reenvio);
  assert.equal((await s.reportar(reenvio, ar, relatorio([{ ano: 2026, mes: 9 }], { falhaUpload: true }))).status, 200);
  await conferirBloqueio(s, reenvio, ar, folhaPendente(falhaEnvio(["2026-09"]), ["2026-09"]), "reenvio com falha", { recalculo: true });
  // A folha antiga de 09/2026 não conta como entregue: a fila continua
  // pedindo o mês, e um relatório vazio do agente não verifica com ela.
  const filaReenvio = await s.chamar("/apuracoes/folha-pendente", { usuario: null, cabecalhos: { "x-licenca-token": reenvio.licenca } });
  assert.ok(filaReenvio.corpo.find(x => x.id === ar.id)?.mesesFolha.some(m => m.ano === 2026 && m.mes === 9), "a fila continua pedindo 09/2026");
  assert.equal((await s.reportar(reenvio, ar, relatorio([]))).status, 200);
  assert.equal((await s.estado(ar)).folha_status, "pendente", "relatório vazio não verifica com a folha antiga");
  await conferirBloqueio(s, reenvio, ar, folhaPendente(falhaEnvio(["2026-09"]), ["2026-09"]), "reenvio com falha e relatório vazio", { recalculo: true });

  // Falha de envio de 09/2026 e, ao mesmo tempo, planilha de 03/2026 em
  // processamento ou com erro, enviada pela tela: o motivo diz as duas coisas,
  // cada uma com o seu mês (o 03/2026 não se resolve pelo agente), aprovação e
  // recálculo dão o mesmo corpo, e a fila só pede 09/2026.
  for (const [status, motivo] of [["pendente", EM_PROCESSAMENTO], ["erro", ERRO_PROCESSAMENTO]]) {
    const misto = await s.cliente(); await s.notas(misto);
    for (const r of REFERENCIAS) await s.processo(misto, refISO(r), 5000);
    const am = await s.criar(misto);
    assert.equal((await s.reportar(misto, am, relatorio([{ ano: 2026, mes: 9 }], { falhaUpload: true }))).status, 200);
    await s.processo(misto, "2026-03-01", 0, { status, criado_em: new Date(Date.now() + 60_000).toISOString() });
    await conferirBloqueio(s, misto, am, folhaPendenteVarias([falhaEnvio(["2026-09"]), ["2026-09"]], [motivo, ["2026-03"]]),
      `falha de envio e folha ${status}`, { recalculo: true });
    assert.deepEqual(await mesesDaFila(s, misto, am), [{ ano: 2026, mes: 9 }], `${status}: a fila só pede o mês com falha de envio`);
  }
  // O próprio 09/2026 com falha de envio e uma planilha nova do mês, criada
  // depois da falha, ainda em processamento: ela substitui a que falhou, então
  // o mês vale pela situação dela, e o agente não é mais chamado.
  const mesmoMes = await s.cliente(); await s.notas(mesmoMes);
  for (const r of REFERENCIAS) await s.processo(mesmoMes, refISO(r), 5000);
  const amm = await s.criar(mesmoMes);
  assert.equal((await s.reportar(mesmoMes, amm, relatorio([{ ano: 2026, mes: 9 }], { falhaUpload: true }))).status, 200);
  await s.processo(mesmoMes, "2026-09-01", 0, { status: "processando", criado_em: new Date(Date.now() + 60_000).toISOString() });
  await conferirBloqueio(s, mesmoMes, amm, folhaPendente(EM_PROCESSAMENTO, ["2026-09"]), "falha de envio e uma planilha nova do mesmo mês em processamento", { recalculo: true });
  assert.equal(await naFila(s, mesmoMes, amm), false, "a planilha nova já está no backend");

  // Relatório dos 12 meses com folha concluída e uma planilha nova de 03/2026
  // em processamento: só 03/2026 falta, e o motivo é o processamento.
  const processando = await s.cliente(); await s.notas(processando);
  for (const r of REFERENCIAS) await s.processo(processando, refISO(r), 5000);
  const apr = await s.criar(processando);
  await s.processo(processando, "2026-03-01", 0, { status: "processando", criado_em: new Date(Date.now() + 60_000).toISOString() });
  assert.equal((await s.reportar(processando, apr, relatorio())).status, 200);
  // O estado gravado lista só o mês que falta; os 11 concluídos não pendem.
  assert.deepEqual((await s.estado(apr)).dados_folha.mesesPendentes, ["2026-03"]);
  await conferirBloqueio(s, processando, apr, folhaPendente(EM_PROCESSAMENTO, ["2026-03"]), "relatório com um mês em processamento", { recalculo: true });

  // Linha gravada pelo agente antigo (janela deslocada; hoje o resultado-folha
  // recusa esse mês) com falha só do próprio PA, fora da janela: a falha de
  // envio continua barrando (#738), sem mês para listar, e aprovação e
  // recálculo dão o mesmo motivo.
  const foraJanela = await s.cliente(); await s.notas(foraJanela);
  for (const r of REFERENCIAS) await s.processo(foraJanela, refISO(r), 5000);
  const aj = await s.criar(foraJanela);
  const antiga = await s.banco.from("apuracoes").update({ folha_status: "pendente", dados_folha: {
    temDozeMeses: false, mesesEncontrados: [{ ano: 2026, mes: 10 }], totalMesesEncontrados: 1,
    falhaUpload: true, processamentoPendente: false, mesesPendentes: [] } }).eq("id", aj.id);
  assert.ifError(antiga.error);
  await conferirBloqueio(s, foraJanela, aj, folhaPendente(falhaEnvio([])), "falha fora da janela", { recalculo: true });
  // Sem mês com falha na janela, a fila pede a janela inteira (nunca uma lista
  // vazia), e o relatório seguinte, dos 12 meses sem falha, verifica. O mês fora
  // da janela não fica na lista relatada.
  // FS12 = 12 × 5.000 = 60.000 → Fator R 0,50 → Anexo III → R$ 600,00.
  assert.deepEqual(await mesesDaFila(s, foraJanela, aj), REFERENCIAS, "falha sem mês da janela pede a janela inteira");
  assert.equal((await s.reportar(foraJanela, aj, relatorio())).status, 200);
  const resolvida = await s.estado(aj);
  assert.equal(resolvida.folha_status, "verificado");
  assert.equal(resolvida.valor_calculado, 600);
  assert.deepEqual(resolvida.dados_folha.mesesEncontrados, REFERENCIAS);
  assert.equal(resolvida.dados_folha.totalMesesEncontrados, 12);
});

// DAS-3: mesesComFalha é opcional; quando vem, só pode trazer meses relatados
// (logo, da janela), sem repetição, e só fica vazio sem falha de envio.
test("DAS-3 resultado-folha recusa mesesComFalha inválido sem mudar a apuração", async t => {
  const s = await iniciarCenarioApuracao(t), c = await s.cliente(); await s.notas(c);
  const a = await s.criar(c), antes = await s.estado(a);
  const setembro = { ano: 2026, mes: 9 }, agosto = { ano: 2026, mes: 8 };
  const LISTA = "mesesComFalha deve ser uma lista";
  const RELATADO = "mesesComFalha deve conter meses de mesesEncontrados";
  const CONTRADITORIO = "Relatório de folha contraditório ou com meses repetidos";
  for (const [payload, erro] of [
    [relatorio([setembro], { falhaUpload: true, mesesComFalha: "2026-09" }), LISTA],
    [relatorio([setembro], { falhaUpload: true, mesesComFalha: { ano: 2026, mes: 9 } }), LISTA],
    [relatorio([setembro], { falhaUpload: true, mesesComFalha: [agosto] }), RELATADO],
    [relatorio([setembro], { falhaUpload: true, mesesComFalha: [{ ano: 2026, mes: 10 }] }), RELATADO],
    [relatorio([setembro], { falhaUpload: true, mesesComFalha: [{ ano: "2026", mes: 9 }] }), RELATADO],
    [relatorio([setembro], { falhaUpload: true, mesesComFalha: [null] }), RELATADO],
    [relatorio([setembro, agosto], { falhaUpload: true, mesesComFalha: [setembro, setembro] }), CONTRADITORIO],
    [relatorio([setembro], { falhaUpload: false, mesesComFalha: [setembro] }), CONTRADITORIO],
    [relatorio([setembro], { falhaUpload: true, mesesComFalha: [] }), CONTRADITORIO],
  ]) {
    const r = await s.reportar(c, a, payload);
    assert.equal(r.status, 400, JSON.stringify(payload));
    assert.deepEqual(r.corpo, { erro }, JSON.stringify(payload));
    assert.deepEqual(await s.estado(a), antes);
  }
  assert.equal((await s.reportar(c, a, relatorio([setembro, agosto], { falhaUpload: true, mesesComFalha: [setembro] }))).status, 200);
  assert.deepEqual((await s.estado(a)).dados_folha.mesesComFalha, [setembro]);
});

// F1 da auditoria da DAS-1: o provisório "natural" (processamento conhecido e
// não concluído) dava 422 FATOR_R_SEM_FOLHA no recálculo e 409 sem mês na
// aprovação. As duas rotas e o POST agora dão o mesmo motivo.
test("DAS-3 provisório criado com folha em erro, pendente ou processando: POST, aprovação e recálculo dão o mesmo motivo", async t => {
  const s = await iniciarCenarioApuracao(t);
  for (const [status, motivo] of [["erro", ERRO_PROCESSAMENTO], ["pendente", EM_PROCESSAMENTO], ["processando", EM_PROCESSAMENTO]]) {
    const c = await s.cliente(); await s.notas(c);
    await s.processo(c, "2026-03-01", 0, { status });
    const a = await s.criar(c);
    const esperado = folhaPendente(motivo, ["2026-03"]);
    // Provisório: Anexo V, 1ª faixa, 10.000,00 × 15,5% = R$ 1.550,00.
    assert.equal(a.folha_status, "pendente", status); assert.equal(a.folha12, null, status); assert.equal(a.valor_calculado, 1550, status);
    assert.deepEqual(a.bloqueio_folha, esperado, `${status}: POST devolve o motivo do provisório`);
    // dados_folha é o relatório do agente: sem relatório, POST, GET e banco
    // não trazem nada que a tela leia como "meses encontrados pelo agente".
    assert.equal(a.dados_folha, null, `${status}: POST sem relatório do agente`);
    assert.equal((await s.chamar(caminho(a))).corpo.dados_folha, null, `${status}: GET sem relatório do agente`);
    assert.equal((await s.estado(a)).dados_folha, null, `${status}: banco sem relatório do agente`);
    await conferirBloqueio(s, c, a, esperado, `provisório com folha ${status}`, { recalculo: true });
    assert.equal(await naFila(s, c, a), false, `${status}: a folha já está no sistema, o agente não é chamado`);
  }
});

// F2 da auditoria da DAS-1: provisório antigo sem nenhum processamento. O 409
// mandava "aguardar a folha", mas o que destrava é o Recalcular; e a linha
// aprovada ficava "aprovado" e "pendente" ao mesmo tempo.
test("DAS-3 provisório antigo sem folha: o 409 manda recalcular e a apuração aprovada não fica pendente", async t => {
  const s = await iniciarCenarioApuracao(t), c = await s.cliente(); await s.notas(c);
  const a = await s.criar(c);
  const r = await s.banco.from("apuracoes").update({ fator_r: 0, folha12: null, valor_calculado: 1550, aliquota_efetiva: .155, folha_status: "pendente" }).eq("id", a.id);
  assert.ifError(r.error);
  const aprovar = await acao(s, a, "aprovar");
  assert.equal(aprovar.status, 409);
  assert.deepEqual(aprovar.corpo, folhaPendente(RECALCULAR));

  // Sem processamento, todo mês conta como zero (#726): FS12 0 e RBT12 > 0 →
  // Fator R 0,01 (Res. CGSN 140/2018, art. 26 §7º, IV) → Anexo V, R$ 1.550,00.
  const recalc = await acao(s, a, "recalcular");
  assert.equal(recalc.status, 200);
  for (const [campo, valor] of Object.entries({ folha12: 0, fator_r: .01, anexo: "V", valor_calculado: 1550, folha_status: "verificado", bloqueio_folha: null })) {
    assert.deepEqual(recalc.corpo[campo], valor, `recálculo: ${campo}`);
  }
  // Rascunho calculado antes do #737, quando mês sem folha deixava a apuração
  // "pendente" na fila do agente: hoje é folha zero aprovável (#737), igual a
  // uma apuração nova sem folha. Fica fora da fila e é aprovada com o
  // folha_status da folha de agora, que não é "pendente".
  const legado = await s.banco.from("apuracoes").update({ folha_status: "pendente" }).eq("id", a.id);
  assert.ifError(legado.error);
  assert.equal(await naFila(s, c, a), false, "linha anterior ao #737 não chama o agente");
  const aprovado = await acao(s, a, "aprovar");
  assert.equal(aprovado.status, 200);
  const get = await s.chamar(caminho(a)), lista = await s.chamar(`/apuracoes?clienteId=${c.id}`);
  for (const [origem, linha] of [["aprovar", aprovado.corpo], ["DB", await s.estado(a)], ["GET /:id", get.corpo], ["GET lista", lista.corpo.find(x => x.id === a.id)]]) {
    assert.equal(linha.status, "aprovado", origem);
    assert.equal(linha.folha_status, "verificado", `${origem}: aprovada com folha zero não fica aguardando o agente`);
  }
  assert.equal(await naFila(s, c, a), false);

  // Linha aprovada antes desta regra (gravada "aprovado" + "pendente").
  const b = await s.criar(c, 9);
  const antiga = await s.banco.from("apuracoes").update({ status: "aprovado", aprovado_por: "contador@teste.com", aprovado_em: new Date().toISOString(), folha_status: "pendente" }).eq("id", b.id);
  assert.ifError(antiga.error);
  const getAntiga = await s.chamar(caminho(b)), listaAntiga = await s.chamar(`/apuracoes?clienteId=${c.id}`);
  assert.equal(getAntiga.corpo.folha_status, "sem_dados");
  assert.equal(listaAntiga.corpo.find(x => x.id === b.id).folha_status, "sem_dados");

  // Linha aprovada antes desta regra a partir de um provisório marcado
  // "verificado" (report antigo, sem FS12): a aprovação não está mais barrada,
  // então a lista não a mostra como "pendente".
  const d = await s.criar(c, 8);
  const antigaVerificada = await s.banco.from("apuracoes").update({ status: "aprovado", aprovado_por: "contador@teste.com", aprovado_em: new Date().toISOString(), fator_r: 0, folha12: null, folha_status: "verificado" }).eq("id", d.id);
  assert.ifError(antigaVerificada.error);
  const listaVerificada = await s.chamar(`/apuracoes?clienteId=${c.id}`);
  assert.equal(listaVerificada.corpo.find(x => x.id === d.id).folha_status, "verificado");
});

// Causa 4, sem um ciclo de falha repetido no meio, com o agente desta versão
// (relatório com mesesComFalha): depois da falha, a fila e o 409 pedem só o
// mês com falha. A folha antiga de 09/2026, anterior à falha, não o tira da
// falha, nem um relatório vazio; o relatório que o traz sem falha, sim.
test("DAS-3 causa 4: depois de uma falha de envio, fila e 409 pedem só o mês com falha, até um relatório trazê-lo sem falha", async t => {
  const s = await iniciarCenarioApuracao(t), c = await s.cliente(); await s.notas(c);
  const a = await s.criar(c);
  const falho = REFERENCIAS[11];
  for (const r of REFERENCIAS) await s.processo(c, refISO(r), 5000);
  assert.equal((await s.reportar(c, a, relatorio(REFERENCIAS, { falhaUpload: true, mesesComFalha: [falho] }))).status, 200);
  assert.deepEqual(await mesesDaFila(s, c, a), [falho], "a nova tentativa só procura o mês que falhou");
  const aprovar = await acao(s, a, "aprovar");
  assert.equal(aprovar.status, 409);
  assert.deepEqual(aprovar.corpo, folhaPendente(falhaEnvio(["2026-09"]), ["2026-09"]), "o 409 lista o mesmo mês que a fila pede");

  assert.equal((await s.reportar(c, a, relatorio([]))).status, 200);
  const vazio = await s.estado(a);
  assert.equal(vazio.folha_status, "pendente", "relatório vazio não verifica");
  assert.deepEqual(vazio.dados_folha.mesesComFalha, [falho]);
  assert.deepEqual(await mesesDaFila(s, c, a), [falho], "a folha antiga de 09/2026 não tira o mês da falha");
  await conferirBloqueio(s, c, a, folhaPendente(falhaEnvio(["2026-09"]), ["2026-09"]), "relatório vazio depois da falha", { recalculo: true });

  // A nova tentativa traz 09/2026 sem falha: verifica, e os 12 meses
  // relatados antes continuam relatados (o relatório só com o mês pedido não
  // reduz a janela relatada).
  // FS12 = 12 × 5.000 = 60.000 (fixture sem FGTS); Fator R 0,50 ≥ 0,28 →
  // Anexo III, 1ª faixa 6% → 10.000,00 × 6% = R$ 600,00.
  assert.equal((await s.reportar(c, a, relatorio([falho], { falhaUpload: false, mesesComFalha: [] }))).status, 200);
  const get = await s.chamar(caminho(a));
  for (const [campo, valor] of Object.entries({ folha_status: "verificado", folha12: 60000, fator_r: .5, anexo: "III", valor_calculado: 600, bloqueio_folha: null })) {
    assert.deepEqual(get.corpo[campo], valor, `após o relatório: ${campo}`);
  }
  const gravado = (await s.estado(a)).dados_folha;
  assert.deepEqual(gravado.mesesEncontrados, REFERENCIAS);
  assert.equal(gravado.totalMesesEncontrados, 12);
  assert.equal(gravado.temDozeMeses, true);
  assert.deepEqual(gravado.mesesComFalha, []);
  assert.equal(await naFila(s, c, a), false);
  assert.equal((await acao(s, a, "aprovar")).status, 200);
});

// Agente antigo (relatório sem mesesComFalha): não se sabe qual arquivo
// falhou, então todo mês relatado fica pendente por falha (escolha
// conservadora: custa um reenvio; aceitar a folha antiga custaria um DAS errado).
test("DAS-3 agente antigo, sem mesesComFalha: com falha de envio, todo mês relatado fica pedido na fila e no 409 até um relatório sem falha", async t => {
  const s = await iniciarCenarioApuracao(t), c = await s.cliente(); await s.notas(c);
  const a = await s.criar(c);
  const falho = REFERENCIAS[11];
  for (const r of REFERENCIAS.slice(0, 11)) await s.processo(c, refISO(r), 5000);
  assert.equal((await s.reportar(c, a, relatorio(REFERENCIAS, { falhaUpload: true }))).status, 200);
  assert.deepEqual(await mesesDaFila(s, c, a), REFERENCIAS, "sem o campo, todos os meses relatados voltam a ser pedidos");
  await conferirBloqueio(s, c, a, folhaPendente(falhaEnvio(REFERENCIAS.map(ref)), REFERENCIAS.map(ref)), "agente antigo com falha", { recalculo: true });

  // 09/2026 chega e o agente antigo relata os 12 meses sem falha: verifica.
  // FS12 = 12 × 5.000 = 60.000 → Fator R 0,50 → Anexo III → R$ 600,00.
  await s.processo(c, refISO(falho), 5000);
  assert.equal((await s.reportar(c, a, relatorio(REFERENCIAS))).status, 200);
  const get = await s.chamar(caminho(a));
  for (const [campo, valor] of Object.entries({ folha_status: "verificado", folha12: 60000, fator_r: .5, anexo: "III", valor_calculado: 600, bloqueio_folha: null })) {
    assert.deepEqual(get.corpo[campo], valor, `após o relatório: ${campo}`);
  }
  assert.equal(await naFila(s, c, a), false);
  assert.equal((await acao(s, a, "aprovar")).status, 200);
});

// Causa 4 com falha de envio (QA13/AU8): antes, cada poll reenviava as 12
// planilhas e somava 11 processamentos a cada 30 s enquanto uma continuasse
// inválida. Agora cada nova tentativa só envia o mês que não chegou.
test("DAS-3 causa 4: depois de falha de envio, cada novo ciclo do agente real só reenvia o mês que não chegou", { timeout: 240_000 }, async t => {
  const s = await iniciarCenarioApuracao(t), c = await s.cliente(); await s.notas(c);
  const a = await s.criar(c);
  const falho = REFERENCIAS[11]; // 09/2026: planilha local inválida, o upload devolve 400
  const porMes = async () => {
    const contagem = {};
    for (const p of await lerTodos(s.banco, "processamentos_folha", { cliente_id: c.id })) {
      const ref = p.mes_referencia.slice(0, 7); contagem[ref] = (contagem[ref] || 0) + 1;
    }
    return contagem;
  };
  await s.worker(c, { item: itemDaFila(c, a), invalido: falho });
  await s.concluidos(c);
  const recebidos = await porMes();
  assert.deepEqual(recebidos, Object.fromEntries(REFERENCIAS.slice(0, 11).map(r => [refISO(r).slice(0, 7), 1])), "11 meses recebidos uma vez; 09/2026 não chegou");
  // Isolamento (regra 3): o outro escritório tem folha de 09/2026. Ela não
  // conta como recebida para este cliente, que continua procurando o mês.
  const outro = await s.cliente();
  await s.processo(outro, refISO(falho), 5000);

  for (const ciclo of [2, 3]) {
    await s.worker(c, { invalido: falho });
    assert.deepEqual(await porMes(), recebidos, `ciclo ${ciclo}: nenhum mês já recebido é reenviado`);
    const fila = await s.chamar("/apuracoes/folha-pendente", { usuario: null, cabecalhos: { "x-licenca-token": c.licenca } });
    assert.deepEqual(fila.corpo.find(x => x.id === a.id)?.mesesFolha, [falho], `ciclo ${ciclo}: a nova tentativa só procura o mês que falhou`);
  }
  await conferirBloqueio(s, c, a, folhaPendente(falhaEnvio(["2026-09"]), ["2026-09"]), "falha de envio repetida", { recalculo: true });

  // Planilha corrigida: o próximo ciclo envia só 09/2026 e a apuração verifica.
  // FS12 = 12 × (5.000 + FGTS 400) = 64.800 → Fator R 0,54 → Anexo III → R$ 600,00.
  await s.worker(c);
  await s.concluidos(c);
  assert.deepEqual(await porMes(), Object.fromEntries(REFERENCIAS.map(r => [refISO(r).slice(0, 7), 1])));
  const get = await s.chamar(caminho(a));
  for (const [campo, valor] of Object.entries({ folha_status: "verificado", folha12: 64800, fator_r: .54, anexo: "III", valor_calculado: 600, bloqueio_folha: null })) {
    assert.deepEqual(get.corpo[campo], valor, `após a correção: ${campo}`);
  }
  assert.equal(await naFila(s, c, a), false);
  assert.equal((await acao(s, a, "aprovar")).status, 200);
});

const contarPorMes = async (s, c) => {
  const contagem = {};
  for (const p of await lerTodos(s.banco, "processamentos_folha", { cliente_id: c.id })) {
    const r = p.mes_referencia.slice(0, 7); contagem[r] = (contagem[r] || 0) + 1;
  }
  return contagem;
};
const umPorMes = refs => Object.fromEntries(refs.map(r => [ref(r), 1]));
const pipelineTerminou = async (s, c) => (await lerTodos(s.banco, "processamentos_folha", { cliente_id: c.id }))
  .filter(p => p.arquivo_origem_path !== "fixture-qa-f-sem-arquivo")
  .every(p => p.status === "concluido" && p.saida_status === "ok");

// Cenário A da revisão: os 12 meses já estão no sistema (chegaram depois da
// criação da apuração) e a planilha nova de 09/2026 falha no envio pelo agente
// real. Antes, o marco "criação da apuração" dava 09/2026 por entregue: a fila
// voltava vazia, o 409 dizia "aguarde" sem mês e o relatório vazio seguinte
// verificava com a folha antiga.
test("DAS-3 cenário A: folha dos 12 meses no sistema e planilha nova de 09/2026 com falha no envio pelo agente real: a fila segue pedindo 09/2026 e nem o relatório vazio verifica", { timeout: 240_000 }, async t => {
  const s = await iniciarCenarioApuracao(t), c = await s.cliente(); await s.notas(c);
  const a = await s.criar(c);
  for (const r of REFERENCIAS) await s.processo(c, refISO(r), 5000);
  const falho = REFERENCIAS[11];

  // Só a pasta de 09/2026 existe, com uma planilha que o upload recusa (400).
  await s.worker(c, { item: itemDaFila(c, a), arquivosMes: [falho], invalido: falho });
  assert.deepEqual(await contarPorMes(s, c), umPorMes(REFERENCIAS), "nada novo chegou");
  const falhou = await s.estado(a);
  assert.equal(falhou.folha_status, "pendente");
  assert.deepEqual(falhou.dados_folha.mesesComFalha, [falho], "o agente informou o mês com falha");
  assert.deepEqual(await mesesDaFila(s, c, a), [falho], "a fila continua pedindo 09/2026");
  await conferirBloqueio(s, c, a, folhaPendente(falhaEnvio(["2026-09"]), ["2026-09"]), "cenário A", { recalculo: true });

  // Relatório vazio (o que o agente mandava quando a fila voltava vazia) e um
  // novo ciclo do agente real com a planilha ainda inválida: segue pendente.
  assert.equal((await s.reportar(c, a, relatorio([]))).status, 200);
  assert.equal((await s.estado(a)).folha_status, "pendente", "relatório vazio não verifica com a folha antiga");
  await s.worker(c, { arquivosMes: [falho], invalido: falho });
  assert.equal((await s.estado(a)).folha_status, "pendente", "2º ciclo com falha");
  assert.deepEqual(await mesesDaFila(s, c, a), [falho]);
  await conferirBloqueio(s, c, a, folhaPendente(falhaEnvio(["2026-09"]), ["2026-09"]), "cenário A, 2º ciclo", { recalculo: true });

  // Planilha corrigida: o próximo ciclo envia só 09/2026 e a apuração verifica.
  // FS12 = 11 × 5.000 (fixture sem FGTS) + (5.000 + FGTS 400) = 60.400; Fator R
  // 60.400 / 120.000 = 0,503 → 0,50 ≥ 0,28 → Anexo III, 1ª faixa 6% → R$ 600,00.
  await s.worker(c);
  await aguardar(() => pipelineTerminou(s, c), "pipeline da planilha corrigida");
  assert.deepEqual(await contarPorMes(s, c), { ...umPorMes(REFERENCIAS), "2026-09": 2 }, "só 09/2026 foi reenviado");
  const get = await s.chamar(caminho(a));
  for (const [campo, valor] of Object.entries({ folha_status: "verificado", folha12: 60400, fator_r: .5, anexo: "III", valor_calculado: 600, bloqueio_folha: null })) {
    assert.deepEqual(get.corpo[campo], valor, `após a correção: ${campo}`);
  }
  assert.equal(await naFila(s, c, a), false);
  assert.equal((await acao(s, a, "aprovar")).status, 200);
});

// Cenário B da revisão: Folha/2026-09 tem duas planilhas e só a segunda
// (pró-labore) falha no envio. Antes, a folha da outra planilha dava 09/2026
// por entregue: o pró-labore nunca era reenviado e o relatório vazio seguinte
// deixava a apuração "sem_dados" com os 12 meses no sistema.
test("DAS-3 cenário B: duas planilhas em 09/2026 e só o pró-labore falha no envio pelo agente real: 09/2026 segue pedido, o pró-labore é reenviado e a apuração não vira verificado nem sem_dados", { timeout: 300_000 }, async t => {
  const s = await iniciarCenarioApuracao(t), c = await s.cliente(); await s.notas(c);
  const a = await s.criar(c);
  const falho = REFERENCIAS[11];
  const proLabore = path.join(s.pasta, c.nome, "Folha", ref(falho), "pro-labore.xlsx");
  await mkdir(path.dirname(proLabore), { recursive: true });
  await writeFile(proLabore, Buffer.from("xlsx inválido QA-F"));

  // 1º ciclo: as 12 folhas chegam; o pró-labore de 09/2026 dá 400. A outra
  // planilha de 09/2026 chegou antes do relatório da falha: não a substitui.
  await s.worker(c, { item: itemDaFila(c, a) });
  await s.concluidos(c);
  assert.deepEqual(await contarPorMes(s, c), umPorMes(REFERENCIAS));
  const conferirPendente = async rotulo => {
    const linha = await s.estado(a);
    assert.equal(linha.folha_status, "pendente", `${rotulo}: nem verificado nem sem_dados`);
    assert.deepEqual(linha.dados_folha.mesesComFalha, [falho], rotulo);
    assert.deepEqual(await mesesDaFila(s, c, a), [falho], `${rotulo}: a fila continua pedindo 09/2026`);
    await conferirBloqueio(s, c, a, folhaPendente(falhaEnvio(["2026-09"]), ["2026-09"]), rotulo, { recalculo: true });
  };
  await conferirPendente("cenário B, 1º ciclo");

  // 2º ciclo, pró-labore ainda inválido: só 09/2026 é varrido. A outra planilha
  // do mês volta a ser enviada (o agente não sabe qual arquivo falhou antes);
  // nenhum outro mês é reenviado. O relatório deste ciclo registra a falha de
  // novo, depois dessa planilha.
  await s.worker(c);
  await s.concluidos(c);
  assert.deepEqual(await contarPorMes(s, c), { ...umPorMes(REFERENCIAS), "2026-09": 2 });
  await conferirPendente("cenário B, 2º ciclo");

  // Pró-labore corrigido (R$ 5.000,00, como a folha): as duas planilhas de
  // 09/2026 chegam e a apuração verifica. FS12 = 12 × (5.000 + FGTS 400) =
  // 64.800 → Fator R 0,54 ≥ 0,28 → Anexo III, 1ª faixa 6% → R$ 600,00.
  await writeFile(proLabore, await planilha(c));
  await s.worker(c);
  await s.concluidos(c);
  assert.deepEqual(await contarPorMes(s, c), { ...umPorMes(REFERENCIAS), "2026-09": 4 });
  const get = await s.chamar(caminho(a));
  for (const [campo, valor] of Object.entries({ folha_status: "verificado", folha12: 64800, fator_r: .54, anexo: "III", valor_calculado: 600, bloqueio_folha: null })) {
    assert.deepEqual(get.corpo[campo], valor, `após a correção: ${campo}`);
  }
  const relatado = (await s.estado(a)).dados_folha;
  assert.equal(relatado.totalMesesEncontrados, 12, "a janela relatada continua com os 12 meses");
  assert.equal(relatado.temDozeMeses, true, "a janela relatada continua com os 12 meses");
  assert.equal(await naFila(s, c, a), false);
  assert.equal((await acao(s, a, "aprovar")).status, 200);
});

// Revisor 6, item 5, na lista: a carga une as janelas das apurações do cliente,
// mas as linhas de folha_calculos de cada janela só são lidas quando ela está
// toda concluída. A planilha nova de 09/2026 em processamento só entra na janela
// da apuração de 10/2026; a de 09/2026 (09/2025 a 08/2026) segue com a FS12 dela.
test("DAS-3 lista com uma janela em processamento e outra concluída: cada apuração segue a própria janela", async t => {
  const s = await iniciarCenarioApuracao(t), c = await s.cliente(); await s.notas(c);
  for (const r of REFERENCIAS) await s.processo(c, refISO(r), 5000);
  // 10/2026: FS12 = 12 × 5.000 = 60.000. 09/2026: 11 meses da REFERENCIAS na
  // janela (10/2025 a 08/2026; 09/2025 sem folha vale zero, #726) = 55.000.
  const outubro = await s.criar(c), setembro = await s.criar(c, 9);
  assert.equal(outubro.folha12, 60000); assert.equal(setembro.folha12, 55000);
  await s.processo(c, "2026-09-01", 0, { status: "processando", criado_em: new Date(Date.now() + 60_000).toISOString() });
  const lista = await s.chamar(`/apuracoes?clienteId=${c.id}`);
  assert.equal(lista.status, 200);
  assert.equal(lista.corpo.find(x => x.id === outubro.id).folha_status, "pendente", "10/2026 espera a planilha de 09/2026");
  assert.equal(lista.corpo.find(x => x.id === setembro.id).folha_status, "verificado", "09/2026 não depende de 09/2026");
  const get = await s.chamar(caminho(setembro));
  assert.equal(get.corpo.folha_status, "verificado"); assert.equal(get.corpo.bloqueio_folha, null);
});

// Início de atividade em 01/2026. A apuração de 09/2026 tem 8 meses de folha
// (01 a 08/2026) e a de 10/2026, 9; a lista carrega os 9 meses de uma vez.
// Linhas de LINHAS_FLOAT (sonda da revisão): soma dos 8 meses = 7.390.325
// centavos = R$ 73.903,25; FS12 proporcional aos meses de atividade (LC
// 123/2006, art. 18 §2º; Res. CGSN 140/2018, art. 26): 73.903,25 / 8 × 12 =
// 110.854,875 → R$ 110.854,88.
test("DAS-3 FS12 em centavos: com as apurações de 09/2026 e 10/2026 do mesmo cliente, a lista e o GET dão o mesmo folha_status", async t => {
  const s = await iniciarCenarioApuracao(t);
  const c = await s.cliente({ data_inicio_atividade: "2026-01-01", historico_receita: [] });
  for (let mes = 1; mes <= 10; mes += 1) await s.notas(c, [10000], { data_emissao: `2026-${String(mes).padStart(2, "0")}-10` });
  // O processamento de 01/2026 é o mais recente e as linhas seguem a ordem dos
  // meses (ids crescentes): é a ordem em que a soma antiga divergia.
  const prefixo = randomUUID().slice(0, 8), agora = Date.now();
  for (const [indice, linhas] of LINHAS_FLOAT.entries()) {
    const mes = indice + 1;
    const p = await s.processo(c, `2026-${String(mes).padStart(2, "0")}-01`, 0, { criado_em: new Date(agora - mes * 60_000).toISOString() });
    await inserir(s.banco, "folha_calculos", linhas.map(([base, fgts], linha) => ({
      ...calculo(p.id, Number(base)), id: `${prefixo}-0000-4000-8000-${String(mes * 10 + linha).padStart(12, "0")}`, base_calculo: base, fgts,
    })));
  }
  const setembro = await s.criar(c, 9), outubro = await s.criar(c, 10);
  assert.equal(setembro.folha12, 110854.88);
  for (const a of [setembro, outubro]) {
    const get = await s.chamar(caminho(a)), lista = await s.chamar(`/apuracoes?clienteId=${c.id}`);
    assert.equal(get.status, 200);
    assert.equal(lista.corpo.find(x => x.id === a.id).folha_status, get.corpo.folha_status, `${a.periodo_mes}/2026: lista e GET dizem o mesmo`);
    assert.equal(get.corpo.folha_status, "verificado", `${a.periodo_mes}/2026`);
    assert.equal(get.corpo.bloqueio_folha, null);
  }
  assert.equal((await acao(s, setembro, "aprovar")).status, 200);
});

// Linha gravada antes do campo mesesComFalha e do marco da falha (relatório do
// agente antigo com falha de 09/2026, folha antiga do mês no sistema): o mês
// relatado conta como falho na fila, no 409 e no recálculo, sem depender de um
// relatório novo. Sem o marco, a planilha nova só tira o mês da falha se for
// posterior ao atualizado_em da apuração, que nunca é anterior ao relatório que
// gravou a falha.
test("DAS-3 linha gravada antes de mesesComFalha e do marco, com falha de envio: o mês relatado segue pedido até chegar uma planilha posterior à gravação", async t => {
  const s = await iniciarCenarioApuracao(t), c = await s.cliente(); await s.notas(c);
  for (const r of REFERENCIAS) await s.processo(c, refISO(r), 5000);
  const a = await s.criar(c);
  const falho = REFERENCIAS[11];
  const antiga = await s.banco.from("apuracoes").update({ folha_status: "pendente", dados_folha: {
    temDozeMeses: false, mesesEncontrados: [falho], totalMesesEncontrados: 1,
    falhaUpload: true, processamentoPendente: true, mesesPendentes: ["2026-09"] } }).eq("id", a.id);
  assert.ifError(antiga.error);
  assert.deepEqual(await mesesDaFila(s, c, a), [falho], "a fila pede o mês relatado");
  await conferirBloqueio(s, c, a, folhaPendente(falhaEnvio(["2026-09"]), ["2026-09"]), "linha antiga com falha", { recalculo: true });

  // Planilha nova de 09/2026, criada depois da gravação (sem passar pelos
  // ganchos): substitui a falha. FS12 = 12 × 5.000 = 60.000 (fixture sem
  // FGTS), a mesma do cálculo; Fator R 0,50 → Anexo III → R$ 600,00.
  const { atualizado_em: gravadoEm } = await s.estado(a);
  const nova = await s.processo(c, refISO(falho), 5000);
  assert.ok(Date.parse(nova.criado_em) > Date.parse(gravadoEm), "a planilha nova é posterior à gravação da falha");
  assert.equal(await naFila(s, c, a), false, "a fila não pede mais 09/2026");
  const get = await s.chamar(caminho(a));
  for (const [campo, valor] of Object.entries({ folha_status: "verificado", folha12: 60000, fator_r: .5, anexo: "III", valor_calculado: 600, bloqueio_folha: null })) {
    assert.deepEqual(get.corpo[campo], valor, `após a planilha nova: ${campo}`);
  }
  // O recálculo não espera mais e grava o relatório sem a falha substituída.
  const recalc = await acao(s, a, "recalcular");
  assert.equal(recalc.status, 200, JSON.stringify(recalc.corpo));
  for (const [campo, valor] of Object.entries({ folha_status: "verificado", folha12: 60000, valor_calculado: 600 })) {
    assert.deepEqual(recalc.corpo[campo], valor, `recálculo: ${campo}`);
  }
  const recalculado = (await s.estado(a)).dados_folha;
  assert.equal(recalculado.falhaUpload, false);
  assert.deepEqual(recalculado.mesesComFalha, []);
  assert.equal((await acao(s, a, "aprovar")).status, 200);
});

// Corrida entre o relatório e o pipeline: o relatório lê a folha com 09/2026
// ainda pendente e, antes de gravar, o pipeline conclui; o gancho dele lê a
// apuração anterior ao relatório e não acha o que mudar (a planilha de 09/2026
// já existia quando a falha foi registrada, então não a substitui). Sem
// reconciliar depois da gravação, o "pendente" do relatório ficava para sempre.
test("DAS-3 relatório gravado depois de a folha concluir no meio: a apuração reconcilia com a folha de agora e verifica", { timeout: 120_000 }, async t => {
  const s = await iniciarCenarioApuracao(t), c = await s.cliente(); await s.notas(c);
  const a = await s.criar(c);
  const falho = REFERENCIAS[11];
  for (const r of REFERENCIAS.slice(0, 11)) await s.processo(c, refISO(r), 5000);

  // A planilha de 09/2026 chega e o pipeline para antes de reivindicar a
  // linha; o relatório do mesmo ciclo registra a falha de outro arquivo do mês.
  const portoes = barreiras(t, c);
  const id = await enviarPlanilha(s, c, ref(falho), await planilha(c));
  await portoes.reivindicacao.chegada;
  assert.equal((await s.reportar(c, a, relatorio(REFERENCIAS, { falhaUpload: true, mesesComFalha: [falho] }))).status, 200);

  // O relatório da nova tentativa lê a folha (09/2026 pendente) e fica parado
  // na gravação da apuração.
  const anterior = globalThis.fetch;
  const gravacao = {};
  gravacao.chegada = new Promise(resolve => { gravacao.chegou = resolve; });
  gravacao.aberta = new Promise(resolve => { gravacao.liberar = resolve; });
  let segurou = false;
  globalThis.fetch = async (entrada, opcoes) => {
    const url = new URL(typeof entrada === "string" || entrada instanceof URL ? entrada : entrada.url);
    if (!segurou && opcoes?.method === "PATCH" && url.pathname === "/rest/v1/apuracoes" && String(opcoes?.body).includes('"mesesComFalha":[]')) {
      segurou = true; gravacao.chegou(); await gravacao.aberta;
    }
    return anterior(entrada, opcoes);
  };
  t.after(() => { globalThis.fetch = anterior; gravacao.liberar(); });
  const relatorioNovo = s.reportar(c, a, relatorio([falho], { falhaUpload: false, mesesComFalha: [] }));
  await gravacao.chegada;

  // O pipeline conclui com o relatório parado; o gancho não muda a apuração.
  const antes = await s.estado(a);
  portoes.reivindicacao.liberar(); portoes.download.liberar();
  await aguardar(async () => { const p = await lerProcessamento(s, id); return p.status === "concluido" && p.saida_status !== "pendente"; }, "fim do pipeline");
  assert.equal((await s.estado(a)).atualizado_em, antes.atualizado_em, "o gancho do fim do pipeline não achou o que mudar");
  gravacao.liberar();
  const resposta = await relatorioNovo;
  globalThis.fetch = anterior;
  assert.equal(resposta.status, 200);

  // FS12 = 11 × 5.000 (fixture sem FGTS) + (5.000 + FGTS 400) = 60.400; Fator R
  // 0,503 → 0,50 ≥ 0,28 → Anexo III, 1ª faixa 6% → R$ 600,00.
  const get = await s.chamar(caminho(a));
  for (const [campo, valor] of Object.entries({ folha_status: "verificado", folha12: 60400, fator_r: .5, anexo: "III", valor_calculado: 600, bloqueio_folha: null })) {
    assert.deepEqual(get.corpo[campo], valor, `após o relatório: ${campo}`);
    assert.deepEqual(resposta.corpo[campo] ?? null, campo === "bloqueio_folha" ? null : valor, `resposta do relatório: ${campo}`);
  }
  assert.equal((await acao(s, a, "aprovar")).status, 200);
});

// Critério (b) da falha de envio (decisão do Gerente, 17/11): o mês sai da
// falha quando chega uma planilha nova dele, criada depois da falha, e o
// pipeline conclui. O watcher do agente envia o arquivo recolocado na pasta e o
// move para enviados/, e o verificador não olha subpastas: sem este critério,
// nenhum relatório novo traria o mês sem falha e ele ficava preso para sempre.
const enviarPelaTela = async (s, c, mes, arquivo) => {
  await s.prepararStorage();
  const formulario = new FormData();
  formulario.append("planilha", new Blob([arquivo], { type: MIME_XLSX }), "folha.xlsx");
  formulario.append("mes_referencia", mes);
  const r = await s.chamar(`/folha/upload?clienteId=${c.id}`, { metodo: "POST", formulario });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  return r.corpo.processamento_id;
};
const fimDoPipeline = (s, id) => aguardar(async () => {
  const p = await lerProcessamento(s, id);
  return p.status === "concluido" && p.saida_status !== "pendente";
}, "fim do pipeline");

test("DAS-3 critério (b): falha de envio de 09/2026 e depois a planilha certa pela tela, com o pipeline concluído: o 409 sai, a fila não pede 09/2026 e a apuração verifica", { timeout: 240_000 }, async t => {
  const s = await iniciarCenarioApuracao(t), c = await s.cliente(); await s.notas(c);
  for (const r of REFERENCIAS) await s.processo(c, refISO(r), 5000);
  const a = await s.criar(c);
  const falho = REFERENCIAS[11];

  // 1. Arquivo local de 09/2026 inválido: o envio do agente real falha.
  await s.worker(c, { item: itemDaFila(c, a), arquivosMes: [falho], invalido: falho });
  assert.deepEqual((await s.estado(a)).dados_folha.mesesComFalha, [falho]);
  await conferirBloqueio(s, c, a, folhaPendente(falhaEnvio(["2026-09"]), ["2026-09"]), "falha de envio", { recalculo: true });
  assert.match((await acao(s, a, "aprovar")).corpo.motivo, /pasta Folha\/2026-09 do computador do escritório, ou envie a planilha certa pela tela de Folha\./);

  // 2. A planilha certa de 09/2026 chega pela tela de Folha e o pipeline conclui.
  await fimDoPipeline(s, await enviarPelaTela(s, c, ref(falho), await planilha(c)));

  // 3. Sem relatório novo do agente: FS12 = 11 × 5.000 (fixture sem FGTS) +
  // (5.000 + FGTS 8% de 400) = 60.400 (Res. CGSN 140/2018, art. 26 §1º); Fator R
  // 60.400 / 120.000 = 0,503 → 0,50 ≥ 0,28 → Anexo III, 1ª faixa 6% (LC
  // 123/2006, art. 18 §5º-J) → 10.000,00 × 6% = R$ 600,00.
  const get = await s.chamar(caminho(a)), lista = await s.chamar(`/apuracoes?clienteId=${c.id}`);
  for (const [campo, valor] of Object.entries({ folha_status: "verificado", folha12: 60400, fator_r: .5, anexo: "III", valor_calculado: 600, bloqueio_folha: null })) {
    assert.deepEqual(get.corpo[campo], valor, `após a planilha da tela: ${campo}`);
  }
  assert.equal(lista.corpo.find(x => x.id === a.id).folha_status, "verificado");
  const gravado = await s.estado(a);
  assert.equal(gravado.dados_folha.falhaUpload, false);
  assert.deepEqual(gravado.dados_folha.mesesComFalha, []);
  assert.equal(await naFila(s, c, a), false, "a fila não pede mais 09/2026");

  // 4. O agente não é mais chamado: um ciclo não envia nada, mesmo com o
  // arquivo inválido ainda na pasta.
  const antes = (await lerTodos(s.banco, "processamentos_folha", { cliente_id: c.id })).length;
  await s.worker(c, { arquivosMes: [] });
  assert.equal((await lerTodos(s.banco, "processamentos_folha", { cliente_id: c.id })).length, antes);
  assert.equal((await acao(s, a, "aprovar")).status, 200);
});

test("DAS-3 critério (b): falha de envio de 09/2026 e depois o arquivo enviado pela rota do agente (watcher), sem relatório novo: a apuração verifica", { timeout: 120_000 }, async t => {
  const s = await iniciarCenarioApuracao(t), c = await s.cliente(); await s.notas(c);
  for (const r of REFERENCIAS) await s.processo(c, refISO(r), 5000);
  const a = await s.criar(c);
  const falho = REFERENCIAS[11];
  assert.equal((await s.reportar(c, a, relatorio([falho], { falhaUpload: true, mesesComFalha: [falho] }))).status, 200);
  assert.deepEqual(await mesesDaFila(s, c, a), [falho]);

  // O watcher envia o arquivo corrigido de 09/2026 (R$ 6.000,00) pela mesma
  // rota do agente; o verificador não relata nada de novo.
  await fimDoPipeline(s, await enviarPlanilha(s, c, ref(falho), await planilha(c, { salario: 6000 })));

  // FS12 = 11 × 5.000 + (6.000 + FGTS 480) = 61.480; Fator R 61.480 / 120.000 =
  // 0,5123 → 0,51 ≥ 0,28 → Anexo III, 1ª faixa 6% → R$ 600,00.
  const get = await s.chamar(caminho(a));
  for (const [campo, valor] of Object.entries({ folha_status: "verificado", folha12: 61480, fator_r: .51, anexo: "III", valor_calculado: 600, bloqueio_folha: null })) {
    assert.deepEqual(get.corpo[campo], valor, `após o envio do watcher: ${campo}`);
  }
  assert.equal(await naFila(s, c, a), false);
  assert.equal((await acao(s, a, "aprovar")).status, 200);
});

// Cenário A da decisão de 16/11: a folha antiga de 09/2026 foi criada antes da
// falha e não a tira. O marco é o criado_em gravado pelo banco: aqui o relógio
// do banco está 5 minutos à frente do Node, e o marco tirado do relógio do Node
// daria a folha antiga por posterior à falha.
test("DAS-3 critério (b), cenário A: a folha antiga de 09/2026, anterior à falha, não a tira, nem com o relógio do banco à frente do Node", async t => {
  const s = await iniciarCenarioApuracao(t), c = await s.cliente(); await s.notas(c);
  const falho = REFERENCIAS[11];
  for (const r of REFERENCIAS.slice(0, 11)) await s.processo(c, refISO(r), 5000);
  const antiga = await s.processo(c, refISO(falho), 5000, { criado_em: new Date(Date.now() + 5 * 60_000).toISOString() });
  const a = await s.criar(c);
  assert.equal((await s.reportar(c, a, relatorio([falho], { falhaUpload: true, mesesComFalha: [falho] }))).status, 200);
  assert.deepEqual((await s.estado(a)).dados_folha.marcosFalha, { "2026-09": antiga.criado_em }, "o marco é o criado_em do banco");

  for (const rotulo of ["cenário A", "cenário A depois do relatório vazio"]) {
    assert.deepEqual(await mesesDaFila(s, c, a), [falho], `${rotulo}: a fila segue pedindo 09/2026`);
    await conferirBloqueio(s, c, a, folhaPendente(falhaEnvio(["2026-09"]), ["2026-09"]), rotulo, { recalculo: true });
    assert.equal((await s.reportar(c, a, relatorio([]))).status, 200);
  }
  assert.equal((await s.estado(a)).folha_status, "pendente");
});

// Cenário B da decisão de 16/11: a planilha boa de 09/2026 do mesmo ciclo foi
// enviada antes do relatório que registrou a falha do pró-labore. Mesmo
// concluída, ela não tira o mês da falha.
test("DAS-3 critério (b), cenário B: a planilha boa do mesmo ciclo, enviada antes do relatório da falha, não a tira", { timeout: 120_000 }, async t => {
  const s = await iniciarCenarioApuracao(t), c = await s.cliente(); await s.notas(c);
  for (const r of REFERENCIAS) await s.processo(c, refISO(r), 5000);
  const a = await s.criar(c);
  const falho = REFERENCIAS[11];
  await fimDoPipeline(s, await enviarPlanilha(s, c, ref(falho), await planilha(c)));
  assert.equal((await s.reportar(c, a, relatorio([falho], { falhaUpload: true, mesesComFalha: [falho] }))).status, 200);

  assert.equal((await s.estado(a)).folha_status, "pendente");
  assert.deepEqual(await mesesDaFila(s, c, a), [falho], "a fila segue pedindo 09/2026");
  await conferirBloqueio(s, c, a, folhaPendente(falhaEnvio(["2026-09"]), ["2026-09"]), "cenário B", { recalculo: true });
});

test("DAS-3 critério (b): planilha nova de 09/2026 depois da falha, com erro no pipeline, não destrava e o motivo passa a ser o erro", { timeout: 120_000 }, async t => {
  const s = await iniciarCenarioApuracao(t), c = await s.cliente(); await s.notas(c);
  for (const r of REFERENCIAS) await s.processo(c, refISO(r), 5000);
  const a = await s.criar(c);
  const falho = REFERENCIAS[11];
  assert.equal((await s.reportar(c, a, relatorio([falho], { falhaUpload: true, mesesComFalha: [falho] }))).status, 200);

  // A planilha nova de 09/2026 tem "cargo" vazio: o cálculo a reprova.
  const ruim = await enviarPlanilha(s, c, ref(falho), await planilha(c, { cargo: "" }));
  await aguardar(async () => (await lerProcessamento(s, ruim)).status === "erro", "erro do pipeline");
  await conferirBloqueio(s, c, a, folhaPendente(ERRO_PROCESSAMENTO, ["2026-09"]), "planilha nova com erro", { recalculo: true });
  assert.equal(await naFila(s, c, a), false, "a planilha já está no backend: o agente não é chamado");
});

// Revisor 5, item 2: sem relatório do agente, o gancho do upload grava
// "pendente" e o do fim do pipeline falha. O gravado fica para trás, mas o
// GET, a lista, a fila e a aprovação seguem a folha viva.
test("DAS-3 gancho do fim do pipeline falhando depois de reenviar 09/2026 pela tela: nenhuma rota diz 'pendente' sem bloqueio, a fila não traz a linha e a aprovação não grava sem_dados", { timeout: 120_000 }, async t => {
  const s = await iniciarCenarioApuracao(t), c = await s.cliente(); await s.notas(c);
  // Os 12 meses com R$ 5.000,00 + FGTS 8% (400,00), o que o pipeline grava
  // para a planilha reenviada: a FS12 não muda com o reenvio.
  for (const r of REFERENCIAS) {
    const p = await s.processo(c, refISO(r));
    await inserir(s.banco, "folha_calculos", { ...calculo(p.id, 5000), fgts: 400 });
  }
  // FS12 = 12 × 5.400 = 64.800 (Res. CGSN 140/2018, art. 26 §1º); Fator R
  // 64.800 / 120.000 = 0,54 ≥ 0,28 → Anexo III, 1ª faixa 6% → R$ 600,00.
  const a = await s.criar(c);
  for (const [campo, valor] of Object.entries({ folha_status: "verificado", folha12: 64800, fator_r: .54, anexo: "III", valor_calculado: 600 })) {
    assert.deepEqual(a[campo], valor, `POST: ${campo}`);
  }

  const portoes = barreiras(t, c);
  const id = await enviarPelaTela(s, c, "2026-09", await planilha(c));
  await portoes.reivindicacao.chegada;
  assert.equal((await s.estado(a)).folha_status, "pendente", "o gancho do upload grava pendente");

  // Só agora a leitura das apurações do cliente cai: é a do gancho do fim do
  // pipeline (o cliente do banco não repete conexão abortada).
  const anterior = globalThis.fetch;
  let falhas = 0;
  const derrubarApuracoes = async (entrada, opcoes) => {
    const url = new URL(typeof entrada === "string" || entrada instanceof URL ? entrada : entrada.url);
    if ((opcoes?.method ?? "GET") === "GET" && url.pathname === "/rest/v1/apuracoes" && url.searchParams.get("cliente_id") === `eq.${c.id}`) {
      falhas += 1;
      const queda = new Error("conexão interrompida");
      queda.name = "AbortError";
      throw queda;
    }
    return anterior(entrada, opcoes);
  };
  globalThis.fetch = derrubarApuracoes;
  t.after(() => { if (globalThis.fetch === derrubarApuracoes) globalThis.fetch = anterior; });
  portoes.reivindicacao.liberar(); portoes.download.liberar();
  await fimDoPipeline(s, id);
  globalThis.fetch = anterior;
  portoes.restaurar();
  assert.ok(falhas > 0, "o gancho do fim do pipeline falhou");
  assert.equal((await s.estado(a)).folha_status, "pendente", "o gravado ficou para trás");

  const get = await s.chamar(caminho(a)), lista = await s.chamar(`/apuracoes?clienteId=${c.id}`);
  for (const [campo, valor] of Object.entries({ folha_status: "verificado", folha12: 64800, fator_r: .54, anexo: "III", valor_calculado: 600, bloqueio_folha: null })) {
    assert.deepEqual(get.corpo[campo], valor, `GET: ${campo}`);
  }
  assert.equal(lista.corpo.find(x => x.id === a.id).folha_status, "verificado", "a lista segue a folha viva");
  assert.equal(await naFila(s, c, a), false, "a folha está toda no sistema: o agente não é chamado");
  const aprovado = await acao(s, a, "aprovar");
  assert.equal(aprovado.status, 200);
  for (const [origem, linha] of [["aprovar", aprovado.corpo], ["DB", await s.estado(a)]]) {
    assert.equal(linha.folha_status, "verificado", `${origem}: a aprovação não grava sem_dados numa folha completa`);
  }
});

// A reconciliação depois do relatório é secundária: se ela falhar (aqui, a
// leitura da folha cai na rede), o relatório já gravado vale e a rota
// responde 200.
test("DAS-3 relatório com mês em processamento e falha na reconciliação seguinte: responde 200 com o relatório gravado", { timeout: 60_000 }, async t => {
  const s = await iniciarCenarioApuracao(t), c = await s.cliente(); await s.notas(c);
  const a = await s.criar(c);
  for (const r of REFERENCIAS.slice(0, 11)) await s.processo(c, refISO(r), 5000);
  await s.processo(c, refISO(REFERENCIAS[11]), 0, { status: "processando" });
  const original = globalThis.fetch;
  let gravou = false, falhas = 0;
  globalThis.fetch = async (entrada, opcoes) => {
    const url = new URL(typeof entrada === "string" || entrada instanceof URL ? entrada : entrada.url);
    const metodo = opcoes?.method ?? "GET";
    if (metodo === "PATCH" && url.pathname === "/rest/v1/apuracoes") gravou = true;
    else if (gravou && !falhas && metodo === "GET" && url.pathname === "/rest/v1/processamentos_folha" &&
      url.searchParams.get("cliente_id") === `eq.${c.id}`) {
      falhas += 1;
      const queda = new Error("conexão interrompida");
      queda.name = "AbortError";
      throw queda;
    }
    return original(entrada, opcoes);
  };
  t.after(() => { globalThis.fetch = original; });
  const r = await s.reportar(c, a, relatorio());
  globalThis.fetch = original;
  assert.equal(falhas, 1, "a leitura da reconciliação falhou");
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(r.corpo.dados_folha.processamentoPendente, true);
  const gravado = await s.estado(a);
  assert.equal(gravado.folha_status, "pendente");
  assert.equal(gravado.dados_folha.processamentoPendente, true);
  assert.deepEqual(gravado.dados_folha.mesesEncontrados, REFERENCIAS);
});
