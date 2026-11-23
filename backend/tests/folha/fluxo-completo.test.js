// TEST-FOLHA-2 (#750): o fluxo inteiro da Folha pelo HTTP, com 15 funcionários em 2 empresas:
// upload -> cálculo -> PDFs -> status -> download, e depois a idempotência (calcular sobre concluído,
// gerar-saída repetido, 5 chamadas em paralelo). Banco descartável de verdade (massa #680); o Storage é
// uma memória que guarda os bytes de verdade (ver helpers/folha-http.js). Os números esperados saem de
// uma conta feita à mão neste teste (INSS marginal 2026; IRRF zerado até 5.000,00; FGTS 8%), não do motor.
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { lerTabela } from "../helpers/banco.js";
import { conhecido } from "../helpers/bug-conhecido.js";
import {
  iniciarBateriaFolha, quinzeFuncionarios, planilha, formularioFolha, enviarWeb, esperarPipeline, folhaPronta,
  comoUsuario, semearProcessamento, assertSemCpf, contar, ehPdf, lerProcessamento, fotografarFolha, EMPRESA_UM, EMPRESA_DOIS, PERFIL,
} from "../helpers/folha-http.js";

const dinheiro = valor => Math.round(Number(valor) * 100) / 100;

describe("TEST-FOLHA-2: fluxo completo da Folha (15 funcionários, 2 empresas)", { timeout: 600_000 }, () => {
  let bateria; let api; let banco; let memoria; let A; let B; let usuarioA; let funcionarios;

  before(async () => { bateria = await iniciarBateriaFolha(); api = bateria.api; funcionarios = quinzeFuncionarios(); });
  after(() => bateria.encerrar());
  beforeEach(async () => {
    ({ banco, memoria, A, B } = await bateria.recriar());
    usuarioA = A.usuario(PERFIL.CLIENTE);
  });

  const arquivoPlanilha = () => planilha(funcionarios);

  it("upload -> cálculo -> PDFs: cada tabela gravada uma única vez, com os números conferidos à mão", async () => {
    assert.equal((await fotografarFolha(banco, memoria)).processamentos_folha.length, 0, "começa sem nenhuma folha");
    const arquivo = await arquivoPlanilha();
    const resposta = await enviarWeb(api, usuarioA, formularioFolha({ arquivo, mes: "2026-10-20" }));
    assert.equal(resposta.status, 201, JSON.stringify(resposta.corpo));
    const id = resposta.corpo.processamento_id;
    const final = await esperarPipeline(banco, id);

    // processamentos_folha: uma linha, do A, competência normalizada para o dia 1, tudo concluído.
    const processamentos = await lerTabela(banco, "processamentos_folha");
    assert.equal(processamentos.length, 1);
    assert.equal(final.cliente_id, A.cliente.id);
    assert.equal(final.mes_referencia, "2026-10-01");
    assert.equal(final.status, "concluido");
    assert.equal(final.saida_status, "ok");
    assert.equal(final.motivo_erro, null);
    assert.equal(final.evento_conclusao_registrado, true);
    assert.deepEqual(memoria.arquivos.get(final.arquivo_origem_path), arquivo, "a planilha ficou guardada, byte a byte");

    // folha_calculos: exatamente 15, deste processamento, cada um com a conta feita à mão.
    const calculos = await lerTabela(banco, "folha_calculos", "funcionario");
    assert.equal(calculos.length, 15);
    assert.ok(calculos.every(c => c.processamento_id === id));
    for (const esperado of funcionarios) {
      const c = calculos.find(item => item.cpf === esperado.cpf);
      assert.ok(c, `sem cálculo para ${esperado.funcionario}`);
      assert.deepEqual(
        { funcionario: c.funcionario, empresa: c.empresa, bruto: dinheiro(c.salario_bruto), inss: dinheiro(c.inss), fgts: dinheiro(c.fgts), ir: dinheiro(c.ir), liquido: dinheiro(c.liquido) },
        { funcionario: esperado.funcionario, empresa: esperado.empresa, bruto: esperado.salario_bruto, ...esperado.esperado },
        esperado.funcionario,
      );
    }

    // Holerites: 15 caminhos distintos, todos no bucket e todos PDF.
    const caminhosHolerite = calculos.map(c => c.holerite_path);
    assert.equal(new Set(caminhosHolerite).size, 15);
    for (const caminho of caminhosHolerite) {
      assert.ok(caminho.startsWith(`clientes/${A.cliente.id}/2026-10/${id}/holerites/`), caminho);
      assert.ok(ehPdf(memoria.arquivos.get(caminho)), caminho);
    }

    // folha_relatorios: um por empresa, com os totais da empresa.
    const relatorios = await lerTabela(banco, "folha_relatorios", "empresa");
    assert.equal(relatorios.length, 2);
    for (const empresa of [EMPRESA_UM, EMPRESA_DOIS]) {
      const doGrupo = funcionarios.filter(f => f.empresa === empresa);
      const relatorio = relatorios.find(r => r.empresa === empresa);
      assert.equal(relatorio.processamento_id, id);
      assert.deepEqual(
        { total_funcionarios: relatorio.total_funcionarios, bruto: dinheiro(relatorio.total_bruto), encargos: dinheiro(relatorio.total_encargos), liquido: dinheiro(relatorio.total_liquido) },
        {
          total_funcionarios: doGrupo.length,
          bruto: dinheiro(doGrupo.reduce((s, f) => s + f.salario_bruto, 0)),
          encargos: dinheiro(doGrupo.reduce((s, f) => s + f.esperado.inss + f.esperado.fgts + f.esperado.ir, 0)),
          liquido: dinheiro(doGrupo.reduce((s, f) => s + f.esperado.liquido, 0)),
        },
        empresa,
      );
      assert.ok(relatorio.arquivo_path.startsWith(`clientes/${A.cliente.id}/2026-10/${id}/relatorios/`), relatorio.arquivo_path);
      assert.ok(ehPdf(memoria.arquivos.get(relatorio.arquivo_path)));
    }

    // Evento e notificação: um de cada, do A, uma única vez.
    const eventos = await lerTabela(banco, "eventos");
    assert.equal(eventos.length, 1);
    assert.equal(eventos[0].cliente_id, A.cliente.id);
    assert.equal(eventos[0].sucesso, true);
    assert.equal(eventos[0].descricao, "Folha processada — 15 funcionários, 2 empresas");
    const notificacoes = await lerTabela(banco, "notificacoes");
    assert.equal(notificacoes.length, 1);
    assert.equal(notificacoes[0].cliente_id, A.cliente.id);
    assert.equal(notificacoes[0].tipo, "arquivo_processado");
    assert.equal(notificacoes[0].mensagem, eventos[0].descricao);

    // Bucket: planilha + 15 holerites + 2 relatórios, nada além; e o B continua sem nada.
    assert.equal(memoria.arquivos.size, 18);
    assert.ok([...memoria.arquivos.keys()].every(c => c.startsWith(`clientes/${A.cliente.id}/`)));
    assert.equal(await contar(banco, "processamentos_folha", { cliente_id: B.cliente.id }), 0);
  });

  it("status e download: os 17 arquivos aparecem sem CPF nem caminho, e cada download devolve o PDF guardado", async () => {
    const final = await folhaPronta(api, banco, usuarioA, funcionarios);
    const status = await comoUsuario(api, usuarioA, `/folha/${final.id}`);
    assert.equal(status.status, 200);
    assert.equal(status.corpo.processamento_id, final.id);
    assert.equal(status.corpo.status, "concluido");
    assert.equal(status.corpo.saida_status, "ok");
    assert.equal(status.corpo.mes_referencia, "2026-10-01");
    assert.equal(status.corpo.total_funcionarios, 15);
    assert.equal(status.corpo.total_empresas, 2);
    assert.equal(status.corpo.arquivos.length, 17);
    assert.equal(status.corpo.arquivos.filter(a => a.tipo === "holerite").length, 15);
    assert.equal(status.corpo.arquivos.filter(a => a.tipo === "relatorio").length, 2);
    // LGPD: nem o CPF nem o caminho do Storage aparecem na resposta.
    assertSemCpf(JSON.stringify(status.corpo), funcionarios.map(x => x.cpf), "status");
    assert.doesNotMatch(JSON.stringify(status.corpo), /clientes\//);
    assert.ok(status.corpo.arquivos.every(a => a.id && a.nome && !("path" in a)));

    const calculos = await lerTabela(banco, "folha_calculos");
    const relatorios = await lerTabela(banco, "folha_relatorios");
    const guardadoPorId = new Map([
      ...calculos.map(c => [c.id, c.holerite_path]),
      ...relatorios.map(r => [r.id, r.arquivo_path]),
    ]);
    assert.deepEqual(status.corpo.arquivos.map(a => a.id).sort(), [...guardadoPorId.keys()].sort());
    for (const arquivo of status.corpo.arquivos) {
      const download = await comoUsuario(api, usuarioA, `/folha/${final.id}/download/${arquivo.id}`);
      assert.equal(download.status, 200, arquivo.nome);
      assert.equal(download.headers.get("content-type"), "application/pdf");
      assert.equal(download.headers.get("content-disposition"), `attachment; filename="${arquivo.nome}"`);
      assertSemCpf(download.headers.get("content-disposition"), funcionarios.map(x => x.cpf), "download");
      assert.deepEqual(download.corpo, memoria.arquivos.get(guardadoPorId.get(arquivo.id)), arquivo.nome);
    }
  });

  describe("idempotência", () => {
    // Fotografia do que o fluxo grava: se uma repetição mexer em qualquer coisa, aparece aqui.
    const estado = async () => {
      const foto = await fotografarFolha(banco, memoria);
      return {
        calculos: foto.folha_calculos.map(c => [c.id, c.holerite_path]),
        relatorios: foto.folha_relatorios.map(r => [r.id, r.arquivo_path]),
        eventos: foto.eventos.length, notificacoes: foto.notificacoes.length, storage: foto.storage,
      };
    };

    it("/calcular sobre folha concluída: 409 e nada é regravado", async () => {
      const final = await folhaPronta(api, banco, usuarioA, funcionarios);
      const antes = await fotografarFolha(banco, memoria);
      const resposta = await comoUsuario(api, usuarioA, `/folha/${final.id}/calcular`, "POST");
      assert.equal(resposta.status, 409);
      assert.deepEqual(resposta.corpo, { erro: "Processamento já está em andamento ou já foi concluído" });
      assert.deepEqual(await fotografarFolha(banco, memoria), antes);
    });

    it("/gerar-saida repetido: 200 sem gerar nada de novo, sem duplicar arquivo, relatório, evento nem notificação", async () => {
      const final = await folhaPronta(api, banco, usuarioA, funcionarios);
      const antes = await estado();
      for (let tentativa = 1; tentativa <= 2; tentativa++) {
        const resposta = await comoUsuario(api, usuarioA, `/folha/${final.id}/gerar-saida`, "POST");
        assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
        assert.deepEqual(resposta.corpo, { processamento_id: final.id, holerites_gerados: 0, relatorios_gerados: 0, empresas: [EMPRESA_UM, EMPRESA_DOIS] });
        assert.deepEqual(await estado(), antes, `tentativa ${tentativa}`);
      }
      assert.equal((await lerProcessamento(banco, final.id)).saida_status, "ok");
    });

    // Folha com o cálculo feito e os PDFs ainda por gerar (como fica entre os dois passos do pipeline).
    async function calculadaSemPdf() {
      const processamento = await semearProcessamento(banco, memoria, A.cliente, { linhas: funcionarios });
      const calculo = await comoUsuario(api, usuarioA, `/folha/${processamento.id}/calcular`, "POST");
      assert.equal(calculo.status, 200, JSON.stringify(calculo.corpo));
      assert.equal(calculo.corpo.funcionarios, 15);
      return processamento.id;
    }

    it("/calcular repetido em paralelo (5 chamadas): uma calcula, as outras 4 levam 409, e há 15 cálculos", async () => {
      const processamento = await semearProcessamento(banco, memoria, A.cliente, { linhas: funcionarios });
      const respostas = await Promise.all(Array.from({ length: 5 }, () => comoUsuario(api, usuarioA, `/folha/${processamento.id}/calcular`, "POST")));
      assert.deepEqual(respostas.map(r => r.status).sort(), [200, 409, 409, 409, 409]);
      assert.equal(await contar(banco, "folha_calculos"), 15);
    });

    it("/gerar-saida em 5 chamadas paralelas: um só conjunto de arquivos (17 PDFs), um evento, uma notificação", async () => {
      const id = await calculadaSemPdf();
      const respostas = await Promise.all(Array.from({ length: 5 }, () => comoUsuario(api, usuarioA, `/folha/${id}/gerar-saida`, "POST")));
      // Qualquer que seja a resposta de cada chamada (ver o BUG (FOLHA-7) abaixo), nada pode duplicar.
      assert.ok(respostas.every(r => [200, 500].includes(r.status)), JSON.stringify(respostas.map(r => r.status)));
      // Uma repetição depois da corrida fecha o conjunto, sem duplicar nada.
      const fecho = await comoUsuario(api, usuarioA, `/folha/${id}/gerar-saida`, "POST");
      assert.equal(fecho.status, 200, JSON.stringify(fecho.corpo));

      const calculos = await lerTabela(banco, "folha_calculos");
      assert.equal(calculos.length, 15);
      assert.equal(new Set(calculos.map(c => c.holerite_path)).size, 15);
      assert.ok(calculos.every(c => c.holerite_path && ehPdf(memoria.arquivos.get(c.holerite_path))));
      const relatorios = await lerTabela(banco, "folha_relatorios");
      assert.equal(relatorios.length, 2);
      const emDisco = [...memoria.arquivos.keys()];
      assert.equal(emDisco.filter(c => c.includes("/holerites/")).length, 15);
      assert.equal(emDisco.filter(c => c.includes("/relatorios/")).length, 2);
      assert.equal(await contar(banco, "eventos"), 1);
      assert.equal(await contar(banco, "notificacoes"), 1);
      assert.equal((await lerProcessamento(banco, id)).evento_conclusao_registrado, true);
    });

    it("BUG (FOLHA-7) /gerar-saida em 5 chamadas paralelas: as cinco respondem 200 e a folha fecha com saida_status ok",
      conhecido("BUG (FOLHA-7, #747): sem upsert, a chamada que perde a corrida pelo mesmo PDF recebe 'already exists' e responde 500 (e grava saida_status = erro numa folha que a outra chamada concluiu); o fix grava com upsert e trata o UNIQUE de folha_relatorios"), async () => {
        const id = await calculadaSemPdf();
        const respostas = await Promise.all(Array.from({ length: 5 }, () => comoUsuario(api, usuarioA, `/folha/${id}/gerar-saida`, "POST")));
        assert.deepEqual(respostas.map(r => r.status), [200, 200, 200, 200, 200], JSON.stringify(respostas.map(r => r.corpo)));
        const final = await lerProcessamento(banco, id);
        assert.equal(final.saida_status, "ok");
        assert.equal(final.motivo_erro, null);
      });
  });
});
