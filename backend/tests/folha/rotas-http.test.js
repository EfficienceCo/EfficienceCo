// TEST-FOLHA-2 (#750): cada rota da Folha com requisição HTTP de verdade e banco descartável de verdade (massa
// #680, dois escritórios): caminho feliz com as TABELAS conferidas depois, entrada inválida (400/404/409/422 e
// o banco intacto), id inexistente e falha do Storage ou do banco no meio. Quem entra (401/403/licença) está em
// autenticacao-perfis.test.js; o 404 de outro escritório, em isolamento-escritorio.test.js; o fluxo de 15
// funcionários e a idempotência, em fluxo-completo.test.js; os bugs abertos, em bugs-conhecidos.test.js.
//
// O que NÃO é de verdade: o Storage (bucket em memória, ver helpers/folha-http.js) e, nos casos "falha do banco",
// só a chamada que falha (as demais seguem no Postgres de verdade): é a única forma de reproduzir um erro
// transitório do banco, que o Postgres descartável não dá.
//
// Estes testes valem antes e depois da FOLHA-3 (#759): onde o `status` muda entre as duas versões do código
// (calculado/concluído), o teste confere o que é comum aos dois e deixa o resto para bugs-conhecidos.test.js.
import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { lerTabela } from "../helpers/banco.js";
import {
  iniciarBateriaFolha, planilha, formularioFolha, enviarWeb, esperarPipeline, lerProcessamento, semearProcessamento,
  comoUsuario, fotografarFolha, assertSemCpf, contar, ehPdf, falharConsultas, linhaFolha, MARIA, JOSE, EMPRESA_UM, EMPRESA_DOIS,
  UUID_INEXISTENTE, PERFIL, MIME_XLSX,
} from "../helpers/folha-http.js";
import { COLUNAS_FOLHA, COLUNA_CATEGORIA } from "../../src/services/folha.service.js";

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const dinheiro = valor => Math.round(Number(valor) * 100) / 100;
// Valem nas duas versões do código: o cálculo terminou (FOLHA-3 troca "concluido" por "calculado" até os PDFs).
const CALCULO_TERMINADO = ["concluido", "calculado"];

describe("TEST-FOLHA-2: rotas da Folha (HTTP, banco real)", { timeout: 900_000 }, () => {
  let bateria; let api; let banco; let memoria; let A; let B; let usuarioA;

  before(async () => { bateria = await iniciarBateriaFolha(); api = bateria.api; });
  after(() => bateria.encerrar());
  beforeEach(async () => {
    ({ banco, memoria, A, B } = await bateria.recriar());
    usuarioA = A.usuario(PERFIL.CLIENTE);
  });
  // Troca de supabase.from e ganchos do bucket nunca vazam para o teste seguinte.
  let falha = null;
  afterEach(() => { falha?.restaurar(); falha = null; memoria.bucket.falharSe = null; });

  const calcular = (id, usuario = usuarioA) => comoUsuario(api, usuario, `/folha/${id}/calcular`, "POST");
  const gerarSaida = (id, usuario = usuarioA) => comoUsuario(api, usuario, `/folha/${id}/gerar-saida`, "POST");
  const status = (id, usuario = usuarioA) => comoUsuario(api, usuario, `/folha/${id}`);
  // Folha com o cálculo feito e os PDFs por gerar.
  async function calculada(linhas = [MARIA, JOSE], mes = "2026-10-01") {
    const processamento = await semearProcessamento(banco, memoria, A.cliente, { linhas, mes });
    const resposta = await calcular(processamento.id);
    assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
    return processamento;
  }
  // Planilha com a linha 2 válida e as linhas 3 (CPF errado) e 4 (vale_transporte fora do domínio) inválidas.
  const planilhaComErros = () => planilha([
    MARIA,
    { ...JOSE, cpf: "12345678900" },
    { ...linhaFolha({ empresa: EMPRESA_UM, funcionario: "Ana Sintetica", cpfBase: "750900013", salario: 2000 }), vale_transporte: "SIMM" },
  ]);

  describe("GET /folha/template", () => {
    it("200 com o modelo .xlsx (cabeçalho do contrato, vale_transporte restrito a SIM/NAO) para os três perfis, sem gravar nada", async () => {
      const antes = await fotografarFolha(banco, memoria);
      for (const perfil of [PERFIL.CLIENTE, PERFIL.FUNCIONARIO, PERFIL.EFFICIENCE]) {
        const resposta = await comoUsuario(api, A.usuario(perfil), "/folha/template");
        assert.equal(resposta.status, 200, perfil);
        assert.equal(resposta.headers.get("content-type"), MIME_XLSX, perfil);
        assert.equal(resposta.headers.get("content-disposition"), "attachment; filename=modelo_folha_pagamento.xlsx", perfil);
      }
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load((await comoUsuario(api, usuarioA, "/folha/template")).corpo);
      const ws = wb.worksheets[0];
      assert.deepEqual(ws.getRow(1).values.slice(1), [...COLUNAS_FOLHA, COLUNA_CATEGORIA].map(c => c.header));
      const colunaVt = COLUNAS_FOLHA.findIndex(c => c.key === "vale_transporte") + 1;
      assert.deepEqual(ws.getRow(2).getCell(colunaVt).dataValidation.formulae, ['"SIM,NAO"']);
      assert.deepEqual(await fotografarFolha(banco, memoria), antes);
    });

    it("a rota estática não é engolida por /:processamento_id (/folha/template não é tratado como id)", async () => {
      const resposta = await comoUsuario(api, usuarioA, "/folha/template");
      assert.equal(resposta.status, 200);
      assert.notEqual(resposta.status, 404);
    });
  });

  describe("POST /folha/upload", () => {
    it("201: grava processamento, planilha, cálculos, relatórios, evento e notificação do escritório do token", async () => {
      const arquivo = await planilha([MARIA, JOSE]);
      const resposta = await enviarWeb(api, usuarioA, formularioFolha({ arquivo, mes: "2026-10-15", nome: "folha de outubro.xlsx" }));
      assert.equal(resposta.status, 201, JSON.stringify(resposta.corpo));
      assert.match(resposta.corpo.processamento_id, REGEX_UUID);
      const final = await esperarPipeline(banco, resposta.corpo.processamento_id);

      assert.equal((await lerTabela(banco, "processamentos_folha")).length, 1);
      assert.equal(final.cliente_id, A.cliente.id);
      assert.equal(final.mes_referencia, "2026-10-01");
      assert.equal(final.status, "concluido");
      assert.equal(final.saida_status, "ok");
      assert.match(final.arquivo_origem_path, new RegExp(`^clientes/${A.cliente.id}/2026-10-01/\\d+_folha_de_outubro\\.xlsx$`));
      assert.deepEqual(memoria.arquivos.get(final.arquivo_origem_path), arquivo, "planilha guardada byte a byte");

      const calculos = await lerTabela(banco, "folha_calculos", "funcionario");
      assert.deepEqual(
        calculos.map(c => [c.funcionario, c.empresa, dinheiro(c.inss), dinheiro(c.fgts), dinheiro(c.ir), dinheiro(c.liquido)]),
        [
          ["Jose Sintetico", EMPRESA_DOIS, 248.6, 240, 0, 2651.4],
          ["Maria Sintetica", EMPRESA_UM, 112.5, 120, 0, 1387.5],
        ],
      );
      assert.equal((await lerTabela(banco, "folha_relatorios")).length, 2);
      assert.equal(await contar(banco, "eventos", { cliente_id: A.cliente.id }), 1);
      assert.equal(await contar(banco, "notificacoes", { cliente_id: A.cliente.id }), 1);
      // O B não ganhou nada.
      for (const tabela of ["processamentos_folha", "eventos", "notificacoes"]) assert.equal(await contar(banco, tabela, { cliente_id: B.cliente.id }), 0, tabela);
    });

    it("funcionario (equipe do escritório) também envia a folha do escritório dele", async () => {
      const resposta = await enviarWeb(api, A.usuario(PERFIL.FUNCIONARIO), formularioFolha({ arquivo: await planilha([MARIA]) }));
      assert.equal(resposta.status, 201, JSON.stringify(resposta.corpo));
      const final = await esperarPipeline(banco, resposta.corpo.processamento_id);
      assert.equal(final.cliente_id, A.cliente.id);
      assert.equal(final.saida_status, "ok");
    });

    it("o escritório vem só do token: cliente_id do outro escritório no formulário é ignorado", async () => {
      const resposta = await enviarWeb(api, B.usuario(PERFIL.CLIENTE), formularioFolha({
        arquivo: await planilha([MARIA]), extras: { cliente_id: A.cliente.id, clienteId: A.cliente.id },
      }));
      assert.equal(resposta.status, 201);
      const final = await esperarPipeline(banco, resposta.corpo.processamento_id);
      assert.equal(final.cliente_id, B.cliente.id);
      assert.equal(await contar(banco, "processamentos_folha", { cliente_id: A.cliente.id }), 0);
      assert.ok([...memoria.arquivos.keys()].every(c => c.startsWith(`clientes/${B.cliente.id}/`)));
    });

    it("admin_efficience escolhe o escritório pelo cliente_id do formulário; sem ele, 400", async () => {
      const equipe = A.usuario(PERFIL.EFFICIENCE);
      const antes = await fotografarFolha(banco, memoria);
      const semCliente = await enviarWeb(api, equipe, formularioFolha({ arquivo: await planilha([MARIA]) }));
      assert.deepEqual([semCliente.status, semCliente.corpo], [400, { erro: "cliente_id é obrigatório" }]);
      assert.deepEqual(await fotografarFolha(banco, memoria), antes);

      const resposta = await enviarWeb(api, equipe, formularioFolha({ arquivo: await planilha([MARIA]), extras: { cliente_id: B.cliente.id } }));
      assert.equal(resposta.status, 201, JSON.stringify(resposta.corpo));
      const final = await esperarPipeline(banco, resposta.corpo.processamento_id);
      assert.equal(final.cliente_id, B.cliente.id);
      assert.equal(await contar(banco, "processamentos_folha", { cliente_id: A.cliente.id }), 0);
    });

    describe("entrada inválida: 400 e nada é gravado (tabelas e Storage)", () => {
      async function recusada(form, esperado) {
        const antes = await fotografarFolha(banco, memoria);
        const resposta = await enviarWeb(api, usuarioA, form);
        assert.equal(resposta.status, 400, JSON.stringify(resposta.corpo));
        for (const [campo, valor] of Object.entries(esperado)) assert.deepEqual(resposta.corpo[campo], valor);
        assert.deepEqual(await fotografarFolha(banco, memoria), antes);
      }

      it("sem arquivo", async () => { await recusada(formularioFolha({}), { erro: "Planilha é obrigatória" }); });

      it("arquivo no campo errado", async () => {
        await recusada(formularioFolha({ arquivo: await planilha([MARIA]), campo: "arquivo" }), {
          erro: "Campo de arquivo inesperado. Envie no campo 'planilha'.",
        });
      });

      it("tipo que não é xlsx (csv, pdf)", async () => {
        for (const [tipo, nome] of [["text/csv", "folha.csv"], ["application/pdf", "folha.pdf"]]) {
          await recusada(formularioFolha({ arquivo: Buffer.from("a,b\n1,2\n"), nome, tipo }), { erro: "Tipo de arquivo não permitido. Envie um .xlsx." });
        }
      });

      it("arquivo acima de 10MB", async () => {
        await recusada(formularioFolha({ arquivo: Buffer.alloc(10 * 1024 * 1024 + 1) }), { erro: "Planilha excede o tamanho máximo permitido (10MB)." });
      });

      it("mes_referencia ausente, fora do formato ou com mês 13", async () => {
        const arquivo = await planilha([MARIA]);
        for (const mes of [null, "", "   ", "10/2026", "2026-13", "2026-00", "2026-1", "outubro"]) {
          await recusada(formularioFolha({ arquivo, mes }), { erro: "mes_referencia é obrigatório no formato YYYY-MM" });
        }
      });

      it("planilha sem uma das colunas obrigatórias: diz qual falta", async () => {
        await recusada(formularioFolha({ arquivo: await planilha([MARIA], { semColuna: "cpf" }) }), {
          erro: "Planilha com colunas obrigatórias faltando", faltando: ["cpf"],
        });
      });

      it("bytes que não são planilha, mesmo com o tipo xlsx", async () => {
        await recusada(formularioFolha({ arquivo: Buffer.from("isto nao e um xlsx") }), {
          erro: "Planilha com colunas obrigatórias faltando", faltando: COLUNAS_FOLHA.map(c => c.header),
        });
      });
    });

    it("storage indisponível: 500 e nenhum processamento fica registrado", async () => {
      memoria.bucket.falharSe = () => true;
      const antes = await fotografarFolha(banco, memoria);
      const resposta = await enviarWeb(api, usuarioA, formularioFolha({ arquivo: await planilha([MARIA]) }));
      assert.deepEqual([resposta.status, resposta.corpo], [500, { erro: "Erro ao salvar planilha" }]);
      assert.deepEqual(await fotografarFolha(banco, memoria), antes);
    });

    it("planilha com linhas inválidas é aceita (201) e o pipeline para em erro, sem cálculo, relatório, evento nem notificação", async () => {
      const resposta = await enviarWeb(api, usuarioA, formularioFolha({ arquivo: await planilhaComErros() }));
      assert.equal(resposta.status, 201);
      const final = await esperarPipeline(banco, resposta.corpo.processamento_id);
      assert.equal(final.cliente_id, A.cliente.id);
      assert.equal(final.status, "erro");
      assert.equal(final.motivo_erro, "Planilha com 2 linha(s) inválida(s)");
      for (const tabela of ["folha_calculos", "folha_relatorios", "eventos", "notificacoes"]) assert.deepEqual(await lerTabela(banco, tabela), [], tabela);
      assert.deepEqual([...memoria.arquivos.keys()], [final.arquivo_origem_path], "só a planilha original ficou no bucket");
    });
  });

  describe("POST /folha/:processamento_id/calcular", () => {
    it("200: grava um cálculo por funcionário (conta à mão), sem gerar PDF, relatório, evento nem notificação", async () => {
      const processamento = await semearProcessamento(banco, memoria, A.cliente);
      const armazenado = [...memoria.arquivos.keys()];
      const fotoB = (await fotografarFolha(banco, memoria)).processamentos_folha.filter(p => p.cliente_id === B.cliente.id);
      const resposta = await calcular(processamento.id);
      assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
      assert.equal(resposta.corpo.processamento_id, processamento.id);
      assert.equal(resposta.corpo.funcionarios, 2);
      assert.deepEqual(
        Object.fromEntries(Object.entries(resposta.corpo.totais).map(([chave, valor]) => [chave, dinheiro(valor)])),
        { bruto: 4500, inss: 361.1, fgts: 360, ir: 0, liquido: 4038.9 },
      );

      const calculos = await lerTabela(banco, "folha_calculos", "funcionario");
      assert.equal(calculos.length, 2);
      assert.ok(calculos.every(c => c.processamento_id === processamento.id && c.holerite_path === null));
      assert.deepEqual(
        calculos.map(c => [c.funcionario, c.cpf, dinheiro(c.salario_bruto), dinheiro(c.inss), dinheiro(c.fgts), dinheiro(c.ir), dinheiro(c.liquido)]),
        [
          ["Jose Sintetico", JOSE.cpf, 3000, 248.6, 240, 0, 2651.4],
          ["Maria Sintetica", MARIA.cpf, 1500, 112.5, 120, 0, 1387.5],
        ],
      );
      assert.ok(CALCULO_TERMINADO.includes((await lerProcessamento(banco, processamento.id)).status));
      for (const tabela of ["folha_relatorios", "eventos", "notificacoes"]) assert.deepEqual(await lerTabela(banco, tabela), [], tabela);
      assert.deepEqual([...memoria.arquivos.keys()], armazenado, "calcular não gera PDF");
      assert.deepEqual((await fotografarFolha(banco, memoria)).processamentos_folha.filter(p => p.cliente_id === B.cliente.id), fotoB);
    });

    it("id inexistente: 404 e nada é gravado", async () => {
      const antes = await fotografarFolha(banco, memoria);
      const resposta = await calcular(UUID_INEXISTENTE);
      assert.deepEqual([resposta.status, resposta.corpo], [404, { erro: "Processamento não encontrado" }]);
      assert.deepEqual(await fotografarFolha(banco, memoria), antes);
    });

    it("processamento já concluído ou em andamento: 409 e nada é regravado", async () => {
      for (const situacao of ["concluido", "processando"]) {
        const processamento = await semearProcessamento(banco, memoria, A.cliente, { status: situacao });
        const antes = await fotografarFolha(banco, memoria);
        const resposta = await calcular(processamento.id);
        assert.deepEqual([resposta.status, resposta.corpo], [409, { erro: "Processamento já está em andamento ou já foi concluído" }], situacao);
        assert.deepEqual(await fotografarFolha(banco, memoria), antes, situacao);
      }
    });

    it("processamento em erro pode ser recalculado depois de corrigida a planilha: 200 e um cálculo por funcionário", async () => {
      const processamento = await semearProcessamento(banco, memoria, A.cliente, { arquivo: await planilhaComErros() });
      const primeira = await calcular(processamento.id);
      assert.equal(primeira.status, 422);
      assert.equal(await contar(banco, "folha_calculos"), 0);
      memoria.arquivos.set(processamento.arquivo_origem_path, await planilha([MARIA, JOSE]));
      const segunda = await calcular(processamento.id);
      assert.equal(segunda.status, 200, JSON.stringify(segunda.corpo));
      assert.equal(await contar(banco, "folha_calculos"), 2);
    });

    it("422 com a linha e o motivo de cada erro da planilha; o processamento vira erro e nada de cálculo é gravado", async () => {
      const processamento = await semearProcessamento(banco, memoria, A.cliente, { arquivo: await planilhaComErros() });
      const resposta = await calcular(processamento.id);
      assert.equal(resposta.status, 422);
      assert.equal(resposta.corpo.erro, "Planilha com linhas inválidas");
      assert.deepEqual(resposta.corpo.detalhes.map(d => d.linha), [3, 4]);
      assert.ok(resposta.corpo.detalhes[0].motivos.includes("cpf inválido"), JSON.stringify(resposta.corpo.detalhes[0]));
      assert.ok(resposta.corpo.detalhes[1].motivos.some(m => /vale_transporte inválido/.test(m)), JSON.stringify(resposta.corpo.detalhes[1]));
      const depois = await lerProcessamento(banco, processamento.id);
      assert.equal(depois.status, "erro");
      assert.equal(depois.motivo_erro, "Planilha com 2 linha(s) inválida(s)");
      assert.equal(await contar(banco, "folha_calculos"), 0);
    });

    it("planilha que sumiu do Storage: 500 e o processamento fica em erro com o motivo", async () => {
      const processamento = await semearProcessamento(banco, memoria, A.cliente);
      memoria.arquivos.delete(processamento.arquivo_origem_path);
      const resposta = await calcular(processamento.id);
      assert.deepEqual([resposta.status, resposta.corpo], [500, { erro: "Erro ao ler planilha da folha" }]);
      const depois = await lerProcessamento(banco, processamento.id);
      assert.deepEqual([depois.status, depois.motivo_erro], ["erro", "Erro ao ler planilha salva"]);
      assert.equal(await contar(banco, "folha_calculos"), 0);
    });

    it("falha do banco ao gravar os cálculos: 500, processamento em erro e nenhum cálculo gravado", async () => {
      const processamento = await semearProcessamento(banco, memoria, A.cliente);
      falha = falharConsultas("folha_calculos", "insert");
      const resposta = await calcular(processamento.id);
      falha.restaurar(); falha = null;
      assert.deepEqual([resposta.status, resposta.corpo], [500, { erro: "Erro ao salvar cálculos da folha" }]);
      const depois = await lerProcessamento(banco, processamento.id);
      assert.deepEqual([depois.status, depois.motivo_erro], ["erro", "Erro ao salvar cálculos da folha"]);
      assert.equal(await contar(banco, "folha_calculos"), 0);
    });

    it("falha do banco na busca do processamento: 500 e nenhuma escrita", async () => {
      const processamento = await semearProcessamento(banco, memoria, A.cliente);
      const antes = await fotografarFolha(banco, memoria);
      falha = falharConsultas("processamentos_folha", "select");
      const resposta = await calcular(processamento.id);
      falha.restaurar(); falha = null;
      assert.deepEqual([resposta.status, resposta.corpo], [500, { erro: "Erro ao buscar processamento" }]);
      assert.deepEqual(await fotografarFolha(banco, memoria), antes);
    });

    it("pipeline do upload: se o cálculo falha, a geração de saída não roda (sem PDF, relatório, evento) e o erro fica registrado", async () => {
      falha = falharConsultas("folha_calculos", "insert");
      const resposta = await enviarWeb(api, usuarioA, formularioFolha({ arquivo: await planilha([MARIA, JOSE]) }));
      assert.equal(resposta.status, 201);
      const final = await esperarPipeline(banco, resposta.corpo.processamento_id);
      falha.restaurar(); falha = null;
      assert.deepEqual([final.status, final.motivo_erro], ["erro", "Erro ao salvar cálculos da folha"]);
      for (const tabela of ["folha_calculos", "folha_relatorios", "eventos", "notificacoes"]) assert.deepEqual(await lerTabela(banco, tabela), [], tabela);
      assert.deepEqual([...memoria.arquivos.keys()], [final.arquivo_origem_path]);
    });
  });

  describe("POST /folha/:processamento_id/gerar-saida", () => {
    it("200: holerite por funcionário, relatório por empresa, evento e notificação, tudo gravado e conferido", async () => {
      const processamento = await calculada();
      const resposta = await gerarSaida(processamento.id);
      assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
      assert.equal(resposta.corpo.processamento_id, processamento.id);
      assert.equal(resposta.corpo.holerites_gerados, 2);
      assert.equal(resposta.corpo.relatorios_gerados, 2);
      assert.deepEqual([...resposta.corpo.empresas].sort(), [EMPRESA_DOIS, EMPRESA_UM]);

      const calculos = await lerTabela(banco, "folha_calculos", "funcionario");
      for (const calculo of calculos) {
        assert.ok(calculo.holerite_path.startsWith(`clientes/${A.cliente.id}/2026-10/${processamento.id}/holerites/`), calculo.holerite_path);
        assertSemCpf(calculo.holerite_path, [MARIA.cpf, JOSE.cpf], "o CPF não vai para o nome do arquivo (LGPD)");
        assert.ok(ehPdf(memoria.arquivos.get(calculo.holerite_path)));
      }
      const relatorios = await lerTabela(banco, "folha_relatorios", "empresa");
      assert.deepEqual(
        relatorios.map(r => [r.empresa, r.total_funcionarios, dinheiro(r.total_bruto), dinheiro(r.total_encargos), dinheiro(r.total_liquido)]),
        [[EMPRESA_DOIS, 1, 3000, 488.6, 2651.4], [EMPRESA_UM, 1, 1500, 232.5, 1387.5]],
      );
      for (const relatorio of relatorios) {
        assert.equal(relatorio.processamento_id, processamento.id);
        assert.ok(ehPdf(memoria.arquivos.get(relatorio.arquivo_path)));
      }
      const eventos = await lerTabela(banco, "eventos");
      assert.deepEqual(eventos.map(e => [e.cliente_id, e.sucesso, e.descricao]), [[A.cliente.id, true, "Folha processada — 2 funcionários, 2 empresas"]]);
      assert.deepEqual((await lerTabela(banco, "notificacoes")).map(n => [n.cliente_id, n.tipo]), [[A.cliente.id, "arquivo_processado"]]);
      const final = await lerProcessamento(banco, processamento.id);
      assert.deepEqual([final.status, final.saida_status, final.motivo_erro, final.evento_conclusao_registrado], ["concluido", "ok", null, true]);
      assert.equal(memoria.arquivos.size, 5, "planilha + 2 holerites + 2 relatórios");
    });

    it("id inexistente: 404 e nada é gravado", async () => {
      const antes = await fotografarFolha(banco, memoria);
      const resposta = await gerarSaida(UUID_INEXISTENTE);
      assert.deepEqual([resposta.status, resposta.corpo], [404, { erro: "Processamento não encontrado" }]);
      assert.deepEqual(await fotografarFolha(banco, memoria), antes);
    });

    it("cálculo ainda não concluído (pendente, em andamento ou erro): 409 e nada é gerado", async () => {
      for (const situacao of ["pendente", "processando", "erro"]) {
        const processamento = await semearProcessamento(banco, memoria, A.cliente, { status: situacao });
        const antes = await fotografarFolha(banco, memoria);
        const resposta = await gerarSaida(processamento.id);
        assert.deepEqual([resposta.status, resposta.corpo], [409, { erro: "Cálculo da folha ainda não foi concluído para este processamento" }], situacao);
        assert.deepEqual(await fotografarFolha(banco, memoria), antes, situacao);
      }
    });

    it("concluído sem nenhum cálculo gravado: 404, sem PDF, relatório, evento nem notificação", async () => {
      const processamento = await semearProcessamento(banco, memoria, A.cliente, { status: "concluido" });
      const resposta = await gerarSaida(processamento.id);
      assert.deepEqual([resposta.status, resposta.corpo], [404, { erro: "Nenhum cálculo encontrado para este processamento" }]);
      for (const tabela of ["folha_calculos", "folha_relatorios", "eventos", "notificacoes"]) assert.deepEqual(await lerTabela(banco, tabela), [], tabela);
      assert.deepEqual([...memoria.arquivos.keys()], [processamento.arquivo_origem_path]);
    });

    it("Storage falha no meio dos holerites: 500, erro registrado, só o que subiu fica gravado; o retry gera só o que faltou", async () => {
      const processamento = await calculada();
      let tentativas = 0;
      memoria.bucket.falharSe = caminho => caminho.includes("/holerites/") && ++tentativas === 2;
      const falhou = await gerarSaida(processamento.id);
      assert.equal(falhou.status, 500);
      assert.match(falhou.corpo.erro, /^Erro ao gerar holerite de /);
      const meio = await lerProcessamento(banco, processamento.id);
      assert.equal(meio.saida_status, "erro");
      assert.equal(meio.motivo_erro, falhou.corpo.erro);
      const calculos = await lerTabela(banco, "folha_calculos");
      assert.equal(calculos.filter(c => c.holerite_path).length, 1, "um holerite subiu, o outro não");
      for (const tabela of ["folha_relatorios", "eventos", "notificacoes"]) assert.deepEqual(await lerTabela(banco, tabela), [], tabela);

      memoria.bucket.falharSe = null;
      const retry = await gerarSaida(processamento.id);
      assert.equal(retry.status, 200, JSON.stringify(retry.corpo));
      assert.equal(retry.corpo.holerites_gerados, 1, "só o holerite que faltou");
      assert.equal(retry.corpo.relatorios_gerados, 2);
      const depois = await lerProcessamento(banco, processamento.id);
      assert.deepEqual([depois.saida_status, depois.motivo_erro], ["ok", null]);
      assert.ok((await lerTabela(banco, "folha_calculos")).every(c => ehPdf(memoria.arquivos.get(c.holerite_path))));
      assert.equal(await contar(banco, "folha_relatorios"), 2);
      assert.equal(await contar(banco, "eventos"), 1);
      assert.equal(await contar(banco, "notificacoes"), 1);
    });

    it("Storage falha no relatório: 500 depois dos holerites prontos; o retry gera só os relatórios e fecha evento e notificação", async () => {
      const processamento = await calculada();
      memoria.bucket.falharSe = caminho => caminho.includes("/relatorios/");
      const falhou = await gerarSaida(processamento.id);
      assert.equal(falhou.status, 500);
      assert.match(falhou.corpo.erro, /^Erro ao gerar relatório de /);
      assert.equal((await lerTabela(banco, "folha_calculos")).filter(c => c.holerite_path).length, 2);
      assert.equal(await contar(banco, "folha_relatorios"), 0);
      assert.equal(await contar(banco, "eventos"), 0);
      assert.equal((await lerProcessamento(banco, processamento.id)).saida_status, "erro");

      memoria.bucket.falharSe = null;
      const retry = await gerarSaida(processamento.id);
      assert.equal(retry.status, 200, JSON.stringify(retry.corpo));
      assert.deepEqual([retry.corpo.holerites_gerados, retry.corpo.relatorios_gerados], [0, 2]);
      assert.equal((await lerProcessamento(banco, processamento.id)).saida_status, "ok");
      assert.equal(await contar(banco, "eventos"), 1);
    });

    it("falha do banco ao ler os cálculos: 500 e o erro de saída fica registrado", async () => {
      const processamento = await calculada();
      falha = falharConsultas("folha_calculos", "select");
      const resposta = await gerarSaida(processamento.id);
      falha.restaurar(); falha = null;
      assert.deepEqual([resposta.status, resposta.corpo], [500, { erro: "Erro ao buscar cálculos da folha" }]);
      const depois = await lerProcessamento(banco, processamento.id);
      assert.deepEqual([depois.saida_status, depois.motivo_erro], ["erro", "Erro ao buscar cálculos da folha"]);
      assert.equal(await contar(banco, "folha_relatorios"), 0);
    });

    it("falha do banco na busca inicial: 500 e NADA é escrito (a checagem de dono vem antes de qualquer escrita)", async () => {
      const processamento = await calculada();
      const antes = await fotografarFolha(banco, memoria);
      falha = falharConsultas("processamentos_folha", "select");
      const resposta = await gerarSaida(processamento.id);
      falha.restaurar(); falha = null;
      assert.deepEqual([resposta.status, resposta.corpo], [500, { erro: "Erro ao buscar processamento" }]);
      assert.deepEqual(await fotografarFolha(banco, memoria), antes);
    });
  });

  describe("GET /folha/:processamento_id", () => {
    it("200 em folha recém-enviada: pendente, sem arquivos nem totais", async () => {
      const processamento = await semearProcessamento(banco, memoria, A.cliente);
      const resposta = await status(processamento.id);
      assert.equal(resposta.status, 200);
      const esperado = { processamento_id: processamento.id, status: "pendente", mes_referencia: "2026-10-01", motivo_erro: null, saida_status: "pendente", total_funcionarios: 0, total_empresas: 0, arquivos: [] };
      for (const [campo, valor] of Object.entries(esperado)) assert.deepEqual(resposta.corpo[campo], valor, campo);
    });

    it("200 com o cálculo feito e sem PDFs: totais de funcionários e empresas, nenhum arquivo", async () => {
      const processamento = await calculada();
      const resposta = await status(processamento.id);
      assert.equal(resposta.status, 200);
      assert.equal(resposta.corpo.total_funcionarios, 2);
      assert.equal(resposta.corpo.total_empresas, 2);
      assert.deepEqual(resposta.corpo.arquivos, []);
    });

    it("200 em erro de planilha: status erro com o motivo", async () => {
      const resposta = await enviarWeb(api, usuarioA, formularioFolha({ arquivo: await planilhaComErros() }));
      const final = await esperarPipeline(banco, resposta.corpo.processamento_id);
      const lido = await status(final.id);
      assert.equal(lido.status, 200);
      assert.equal(lido.corpo.status, "erro");
      assert.equal(lido.corpo.motivo_erro, "Planilha com 2 linha(s) inválida(s)");
      assert.deepEqual(lido.corpo.arquivos, []);
    });

    it("geração de saída falhou: saida_status e motivo_erro expõem o erro (#440)", async () => {
      const processamento = await calculada();
      memoria.bucket.falharSe = caminho => caminho.includes("/holerites/");
      assert.equal((await gerarSaida(processamento.id)).status, 500);
      const lido = await status(processamento.id);
      assert.equal(lido.status, 200);
      assert.equal(lido.corpo.saida_status, "erro");
      assert.match(lido.corpo.motivo_erro, /^Erro ao gerar holerite de /);
      assert.deepEqual(lido.corpo.arquivos, []);
    });

    it("id inexistente: 404", async () => {
      const resposta = await status(UUID_INEXISTENTE);
      assert.deepEqual([resposta.status, resposta.corpo], [404, { erro: "Processamento não encontrado" }]);
    });

    it("os três perfis do escritório leem a folha dele; admin_efficience lê a de qualquer escritório", async () => {
      const processamento = await calculada();
      for (const perfil of [PERFIL.CLIENTE, PERFIL.FUNCIONARIO]) assert.equal((await status(processamento.id, A.usuario(perfil))).status, 200, perfil);
      assert.equal((await status(processamento.id, B.usuario(PERFIL.EFFICIENCE))).status, 200);
    });

    it("falha do banco ao ler os cálculos: 500", async () => {
      const processamento = await calculada();
      falha = falharConsultas("folha_calculos", "select");
      const resposta = await status(processamento.id);
      falha.restaurar(); falha = null;
      assert.deepEqual([resposta.status, resposta.corpo], [500, { erro: "Erro ao buscar arquivos do processamento" }]);
    });
  });

  describe("GET /folha/:processamento_id/download/:arquivo", () => {
    async function folhaComArquivos() {
      const processamento = await calculada();
      assert.equal((await gerarSaida(processamento.id)).status, 200);
      const arquivos = (await status(processamento.id)).corpo.arquivos;
      return { processamento, arquivos, holerite: arquivos.find(a => a.tipo === "holerite"), relatorio: arquivos.find(a => a.tipo === "relatorio") };
    }
    const baixar = (processamentoId, arquivo, usuario = usuarioA) => comoUsuario(api, usuario, `/folha/${processamentoId}/download/${arquivo}`);

    it("200: o PDF guardado, com o nome de exibição sem CPF, para holerite e relatório e para os três perfis", async () => {
      const { processamento, holerite, relatorio } = await folhaComArquivos();
      for (const arquivo of [holerite, relatorio]) {
        for (const perfil of [PERFIL.CLIENTE, PERFIL.FUNCIONARIO, PERFIL.EFFICIENCE]) {
          const resposta = await baixar(processamento.id, arquivo.id, A.usuario(perfil));
          assert.equal(resposta.status, 200, `${arquivo.tipo} / ${perfil}`);
          assert.equal(resposta.headers.get("content-type"), "application/pdf");
          assert.equal(resposta.headers.get("content-disposition"), `attachment; filename="${arquivo.nome}"`);
          assert.ok(ehPdf(resposta.corpo));
        }
      }
      assert.match(holerite.nome, /^holerite_empresa_sintetica_(um|dois)_(maria|jose)_sintetic[ao]\.pdf$/);
      assert.match(relatorio.nome, /^relatorio_fechamento_empresa_sintetica_(um|dois)_2026-10\.pdf$/);
    });

    it("id inexistente (processamento ou arquivo): 404", async () => {
      const { processamento } = await folhaComArquivos();
      const semProcessamento = await baixar(UUID_INEXISTENTE, UUID_INEXISTENTE);
      assert.deepEqual([semProcessamento.status, semProcessamento.corpo], [404, { erro: "Processamento não encontrado" }]);
      const semArquivo = await baixar(processamento.id, UUID_INEXISTENTE);
      assert.deepEqual([semArquivo.status, semArquivo.corpo], [404, { erro: "Arquivo não encontrado para este processamento" }]);
    });

    it("só o id opaco vale: nome do arquivo, CPF e tentativas de sair da pasta dão 404", async () => {
      const { processamento, holerite } = await folhaComArquivos();
      const calculo = (await lerTabela(banco, "folha_calculos")).find(c => c.id === holerite.id);
      for (const tentativa of [holerite.nome, calculo.cpf, MARIA.cpf, `../${holerite.id}`, `holerites/${holerite.id}`, `..\\${holerite.id}`, calculo.holerite_path]) {
        const resposta = await baixar(processamento.id, encodeURIComponent(tentativa));
        assert.equal(resposta.status, 404, tentativa);
        assert.deepEqual(resposta.corpo, { erro: "Arquivo não encontrado para este processamento" }, tentativa);
      }
    });

    it("antes de a folha estar concluída: 409 e nenhum arquivo sai", async () => {
      const pendente = await semearProcessamento(banco, memoria, A.cliente);
      const comErro = await semearProcessamento(banco, memoria, A.cliente, { status: "erro" });
      for (const { id } of [pendente, comErro]) {
        const resposta = await baixar(id, UUID_INEXISTENTE);
        assert.deepEqual([resposta.status, resposta.corpo], [409, { erro: "Download disponível apenas quando o processamento estiver concluído" }]);
      }
    });

    it("PDF que sumiu do Storage: 500 'Erro ao baixar arquivo'", async () => {
      const { processamento, holerite } = await folhaComArquivos();
      const calculo = (await lerTabela(banco, "folha_calculos")).find(c => c.id === holerite.id);
      memoria.arquivos.delete(calculo.holerite_path);
      const resposta = await baixar(processamento.id, holerite.id);
      assert.deepEqual([resposta.status, resposta.corpo], [500, { erro: "Erro ao baixar arquivo" }]);
    });
  });
});
