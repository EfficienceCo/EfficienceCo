// TEST-FOLHA-2 (#750): os bugs abertos da Folha, cada um com o teste do comportamento CERTO e `skip` até o fix
// entrar. Com RODAR_BUGS_CONHECIDOS=1 os testes rodam de verdade (é assim que se prova que o skip ainda é
// necessário e que o teste falha pelo motivo certo). Quando o PR do fix for mergeado, trocar `conhecido(...)`
// por `{}` no teste dele. Os fixes estão em PRs abertos e NÃO na main:
//   FOLHA-2 #742 (PR #758)  erros da planilha com linha e motivo visíveis no status
//   FOLHA-3 #743 (PR #759)  status nunca "concluido" antes dos PDFs
//   FOLHA-4 #744 (PR #754)  competência sem tabela INSS/IRRF recusada no upload
//   FOLHA-6 #746 (PR #762)  listagem de processamentos no servidor (GET /folha)
//   FOLHA-7 #747 (PR #755)  retry idempotente, id não-UUID sem 500, token do agente antes do multer
//   FOLHA-8 #748 (PR #756)  checklist do processo folha_pagamento avançando com o pipeline
// Os testes são escritos contra o comportamento correto descrito nas issues e nos PRs; se o PR mudar o contrato
// (nome de campo, mensagem), o ajuste é a troca do `conhecido` por `{}` com o campo certo.
import { describe, it, before, after, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { contextoDb } from "../../src/config/db-usuario.js";
import { lerTabela } from "../helpers/banco.js";
import { conhecido } from "../helpers/bug-conhecido.js";
import {
  iniciarBateriaFolha, planilha, formularioFolha, enviarWeb, enviarAgente, esperar, esperarPipeline, folhaPronta, lerProcessamento,
  semearProcessamento, comoUsuario, fotografarFolha, contar, ehPdf, linhaFolha, quinzeFuncionarios, MARIA, JOSE, EMPRESA_UM, PERFIL,
} from "../helpers/folha-http.js";

const REGEX_UUID_INVALIDO_MSG = /uuid/i;

describe("TEST-FOLHA-2: bugs conhecidos da Folha (um skip por problema aberto)", { timeout: 900_000 }, () => {
  let bateria; let api; let banco; let memoria; let A; let B; let usuarioA;

  before(async () => { bateria = await iniciarBateriaFolha(); api = bateria.api; });
  after(() => bateria.encerrar());
  beforeEach(async () => {
    ({ banco, memoria, A, B } = await bateria.recriar());
    usuarioA = A.usuario(PERFIL.CLIENTE);
  });
  afterEach(() => { memoria.bucket.falharSe = null; });

  const calcular = (id) => comoUsuario(api, usuarioA, `/folha/${id}/calcular`, "POST");
  const gerarSaida = (id) => comoUsuario(api, usuarioA, `/folha/${id}/gerar-saida`, "POST");
  const status = (id) => comoUsuario(api, usuarioA, `/folha/${id}`);
  const baixar = (id, arquivo) => comoUsuario(api, usuarioA, `/folha/${id}/download/${arquivo}`);
  // Linhas 3 (CPF errado) e 4 (vale_transporte fora do domínio) inválidas.
  const planilhaComErros = () => planilha([
    MARIA,
    { ...JOSE, cpf: "12345678900" },
    { ...linhaFolha({ empresa: EMPRESA_UM, funcionario: "Ana Sintetica", cpfBase: "750900013", salario: 2000 }), vale_transporte: "SIMM" },
  ]);
  async function calculada(linhas = [MARIA, JOSE], mes = "2026-10-01") {
    const processamento = await semearProcessamento(banco, memoria, A.cliente, { linhas, mes });
    const resposta = await calcular(processamento.id);
    assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
    return processamento;
  }

  describe("FOLHA-2 (#742): o contador vê quais linhas da planilha estão erradas", () => {
    it("BUG (FOLHA-2) GET /folha/:id devolve erros_planilha com a linha e os motivos de cada erro",
      conhecido("BUG (FOLHA-2, #742, PR #758): os erros por linha só vão para o log; o status devolve só 'Planilha com N linha(s) inválida(s)' e o contador não sabe qual linha corrigir"), async () => {
        const resposta = await enviarWeb(api, usuarioA, formularioFolha({ arquivo: await planilhaComErros() }));
        const final = await esperarPipeline(banco, resposta.corpo.processamento_id);
        assert.equal(final.status, "erro");
        const lido = await status(final.id);
        assert.equal(lido.status, 200);
        assert.equal(lido.corpo.status, "erro");
        assert.ok(Array.isArray(lido.corpo.erros_planilha), `erros_planilha ausente: ${JSON.stringify(lido.corpo)}`);
        assert.deepEqual(lido.corpo.erros_planilha.map(e => e.linha), [3, 4]);
        assert.ok(lido.corpo.erros_planilha[0].motivos.includes("cpf inválido"), JSON.stringify(lido.corpo.erros_planilha[0]));
        assert.ok(lido.corpo.erros_planilha[1].motivos.some(m => /vale_transporte inválido/.test(m)), JSON.stringify(lido.corpo.erros_planilha[1]));
      });

    it("BUG (FOLHA-2) sem erro de planilha, erros_planilha é a lista vazia",
      conhecido("BUG (FOLHA-2, #742, PR #758): o campo erros_planilha não existe no status"), async () => {
        const final = await folhaPronta(api, banco, usuarioA, [MARIA, JOSE]);
        const lido = await status(final.id);
        assert.deepEqual(lido.corpo.erros_planilha, []);
      });

    it("BUG (FOLHA-2) recalcular com a planilha corrigida limpa os erros antigos",
      conhecido("BUG (FOLHA-2, #742, PR #758): sem o campo erros_planilha não há o que limpar; o fix zera o campo no recálculo bem-sucedido"), async () => {
        const processamento = await semearProcessamento(banco, memoria, A.cliente, { arquivo: await planilhaComErros() });
        assert.equal((await calcular(processamento.id)).status, 422);
        assert.equal((await status(processamento.id)).corpo.erros_planilha?.length, 2, "controle: os erros ficaram registrados");
        memoria.arquivos.set(processamento.arquivo_origem_path, await planilha([MARIA, JOSE]));
        assert.equal((await calcular(processamento.id)).status, 200);
        assert.deepEqual((await status(processamento.id)).corpo.erros_planilha, []);
      });
  });

  describe("FOLHA-3 (#743): o status só vira concluído quando os PDFs estão prontos", () => {
    it("BUG (FOLHA-3) depois do cálculo e antes dos PDFs: status não é 'concluido' e o download segue bloqueado; depois da saída, concluído e baixável",
      conhecido("BUG (FOLHA-3, #743, PR #759): calcularFolha grava status = concluido assim que salva os cálculos, antes de gerar os PDFs; a tela mostra 'concluído' com a lista de arquivos vazia"), async () => {
        const processamento = await calculada();
        assert.notEqual((await lerProcessamento(banco, processamento.id)).status, "concluido", "no banco");
        const antes = await status(processamento.id);
        assert.equal(antes.status, 200);
        assert.notEqual(antes.corpo.status, "concluido", "na API, com 0 de 4 arquivos");
        assert.deepEqual(antes.corpo.arquivos, []);
        const bloqueado = await baixar(processamento.id, "qualquer");
        assert.equal(bloqueado.status, 409);

        assert.equal((await gerarSaida(processamento.id)).status, 200);
        const depois = await status(processamento.id);
        assert.equal(depois.corpo.status, "concluido");
        assert.equal(depois.corpo.arquivos.length, 4);
        const baixado = await baixar(processamento.id, depois.corpo.arquivos[0].id);
        assert.equal(baixado.status, 200);
        assert.ok(ehPdf(baixado.corpo));
      });

    it("BUG (FOLHA-3) PDF que falha: o status nunca é 'concluido' (e o download fica bloqueado) até o retry dar certo",
      conhecido("BUG (FOLHA-3, #743, PR #759): com o PDF falhando, status continua 'concluido' (só saida_status = erro) e a tela mostra concluído sem arquivos"), async () => {
        const processamento = await calculada();
        memoria.bucket.falharSe = caminho => caminho.includes("/holerites/");
        assert.equal((await gerarSaida(processamento.id)).status, 500);
        const comFalha = await status(processamento.id);
        assert.notEqual(comFalha.corpo.status, "concluido");
        assert.equal(comFalha.corpo.saida_status, "erro");
        assert.equal((await baixar(processamento.id, "qualquer")).status, 409);

        memoria.bucket.falharSe = null;
        assert.equal((await gerarSaida(processamento.id)).status, 200);
        assert.equal((await status(processamento.id)).corpo.status, "concluido");
      });

    it("BUG (FOLHA-3) acompanhando o pipeline do upload (15 funcionários): nenhuma leitura do status mostra 'concluido' com arquivos faltando",
      conhecido("BUG (FOLHA-3, #743, PR #759): entre o fim do cálculo e o fim dos PDFs o status já é 'concluido' com menos de 17 arquivos"), async () => {
        const arquivo = await planilha(quinzeFuncionarios());
        const resposta = await enviarWeb(api, usuarioA, formularioFolha({ arquivo }));
        const id = resposta.corpo.processamento_id;
        const mostrouConcluidoIncompleto = [];
        await esperar("pipeline", async () => {
          const lido = await status(id);
          if (lido.corpo.status === "concluido" && lido.corpo.arquivos.length < 17) mostrouConcluidoIncompleto.push(lido.corpo.arquivos.length);
          return lerProcessamento(banco, id);
        }, p => p.status === "erro" || (p.status === "concluido" && p.saida_status === "ok"));
        assert.deepEqual(mostrouConcluidoIncompleto, []);
        const final = await status(id);
        assert.equal(final.corpo.status, "concluido");
        assert.equal(final.corpo.arquivos.length, 17);
      });
  });

  describe("FOLHA-4 (#744): competência sem tabela INSS/IRRF é recusada no upload", () => {
    // As tabelas vão de 01/2024 a 12/2026.
    for (const [rotulo, mes, mesAno] of [["depois da última tabela", "2027-01", "01/2027"], ["antes da primeira tabela", "2023-12", "12/2023"]]) {
      it(`BUG (FOLHA-4) upload (web e agente) de competência ${rotulo} (${mes}): 400 com a mensagem, e nada é gravado`,
        conhecido("BUG (FOLHA-4, #744, PR #754): o upload aceita (201) e o pipeline falha depois com 'Erro inesperado ao calcular folha'; o fix confere a tabela antes de gravar e responde 400"), async () => {
          const arquivo = await planilha([MARIA]);
          const antes = await fotografarFolha(banco, memoria);
          const web = await enviarWeb(api, usuarioA, formularioFolha({ arquivo, mes }));
          const agente = await enviarAgente(api, A.token, formularioFolha({ arquivo, mes }));
          for (const [via, resposta] of [["web", web], ["agente", agente]]) {
            assert.equal(resposta.status, 400, `${via}: ${JSON.stringify(resposta.corpo)}`);
            assert.match(resposta.corpo.erro, /tabela/i, via);
            assert.ok(resposta.corpo.erro.includes(mesAno), `${via}: a mensagem tem de dizer a competência ${mesAno}: ${resposta.corpo.erro}`);
          }
          assert.deepEqual(await fotografarFolha(banco, memoria), antes);
        });
    }

    it("BUG (FOLHA-4) /calcular de processamento antigo sem tabela: 422 com o motivo registrado, não 500 genérico",
      conhecido("BUG (FOLHA-4, #744, PR #754): a exceção de resolverTabelaFolha cai no catch geral: 500 'Erro ao calcular folha' e motivo 'Erro inesperado ao calcular folha'"), async () => {
        const processamento = await semearProcessamento(banco, memoria, A.cliente, { mes: "2023-12-01" });
        const resposta = await calcular(processamento.id);
        assert.equal(resposta.status, 422, JSON.stringify(resposta.corpo));
        const depois = await lerProcessamento(banco, processamento.id);
        assert.equal(depois.status, "erro");
        assert.match(depois.motivo_erro, /tabela/i);
        assert.ok(depois.motivo_erro.includes("12/2023"), depois.motivo_erro);
        assert.equal(await contar(banco, "folha_calculos"), 0);
      });
  });

  describe("FOLHA-6 (#746): listagem de processamentos feita no servidor (GET /folha)", () => {
    // A: 2026-09 (web), 2026-10 (web), 2026-10 (agente, o mais novo). B: 2026-10 (web).
    async function montar() {
      const web = (usuario, mes) => folhaPronta(api, banco, usuario, [MARIA], { mes });
      const setembro = await web(usuarioA, "2026-09");
      const outubroWeb = await web(usuarioA, "2026-10");
      const resposta = await enviarAgente(api, A.token, formularioFolha({ arquivo: await planilha([MARIA]), mes: "2026-10" }));
      assert.equal(resposta.status, 201);
      const outubroAgente = await esperarPipeline(banco, resposta.corpo.processamento_id);
      const doB = await web(B.usuario(PERFIL.CLIENTE), "2026-10");
      return { setembro: setembro.id, outubroWeb: outubroWeb.id, outubroAgente: outubroAgente.id, doB: doB.id };
    }
    const listar = (usuario, consulta = "") => comoUsuario(api, usuario, `/folha${consulta}`);

    it("BUG (FOLHA-6) devolve só os processamentos do escritório do token, do mais recente para o mais antigo, com competência, status, origem e vigente",
      conhecido("BUG (FOLHA-6, #746, PR #762): GET /folha não existe (404); a tela lista pelo navegador, com o que ele guardou"), async () => {
        const ids = await montar();
        for (const perfil of [PERFIL.CLIENTE, PERFIL.FUNCIONARIO]) {
          const resposta = await listar(A.usuario(perfil));
          assert.equal(resposta.status, 200, perfil);
          const lista = resposta.corpo.processamentos;
          assert.deepEqual(lista.map(p => p.id), [ids.outubroAgente, ids.outubroWeb, ids.setembro], perfil);
          assert.ok(!lista.some(p => p.id === ids.doB), `${perfil} do A recebeu processamento do B`);
          assert.deepEqual(lista.map(p => p.mes_referencia), ["2026-10-01", "2026-10-01", "2026-09-01"]);
          assert.ok(lista.every(p => p.status === "concluido"));
          assert.deepEqual(lista.map(p => p.origem), ["agente", "web", "web"]);
          // Vigente = o mais recente de cada competência (a regra que a Apuração usa para ler a folha).
          assert.deepEqual(lista.map(p => p.vigente), [true, false, true]);
        }
        const web = (await listar(usuarioA)).corpo.processamentos.find(p => p.id === ids.outubroWeb);
        assert.equal(web.enviado_por_nome, usuarioA.nome);
        assert.equal((await listar(usuarioA)).corpo.processamentos[0].enviado_por_nome, null, "upload do agente não tem remetente");
      });

    it("BUG (FOLHA-6) ?mes_referencia=YYYY-MM filtra a competência; formato inválido é 400",
      conhecido("BUG (FOLHA-6, #746, PR #762): rota inexistente na main"), async () => {
        const ids = await montar();
        const outubro = await listar(usuarioA, "?mes_referencia=2026-10");
        assert.equal(outubro.status, 200);
        assert.deepEqual(outubro.corpo.processamentos.map(p => p.id), [ids.outubroAgente, ids.outubroWeb]);
        assert.deepEqual((await listar(usuarioA, "?mes_referencia=2026-08")).corpo.processamentos, []);
        for (const invalido of ["10/2026", "2026-13", "outubro", ""]) {
          const resposta = await listar(usuarioA, `?mes_referencia=${encodeURIComponent(invalido)}`);
          assert.equal(resposta.status, 400, invalido);
        }
      });

    it("BUG (FOLHA-6) escritório pelo token: cliente_id do outro escritório na query não vale; admin_efficience escolhe o escritório; deslogado 401 e perfil inválido 403",
      conhecido("BUG (FOLHA-6, #746, PR #762): rota inexistente na main"), async () => {
        const ids = await montar();
        const comQueryDoB = await listar(usuarioA, `?cliente_id=${B.cliente.id}&clienteId=${B.cliente.id}`);
        assert.equal(comQueryDoB.status, 200);
        assert.ok(!comQueryDoB.corpo.processamentos.some(p => p.id === ids.doB));
        assert.equal(comQueryDoB.corpo.processamentos.length, 3);

        const equipe = A.usuario(PERFIL.EFFICIENCE);
        assert.deepEqual((await listar(equipe, `?cliente_id=${B.cliente.id}`)).corpo.processamentos.map(p => p.id), [ids.doB]);
        assert.equal((await listar(equipe)).status, 400, "admin_efficience sem cliente_id");
        assert.equal((await listar(B.usuario(PERFIL.FUNCIONARIO))).corpo.processamentos.length, 1);

        const antes = await fotografarFolha(banco, memoria);
        const deslogado = await api.requisitar("/folha");
        assert.equal(deslogado.status, 401);
        assert.deepEqual(deslogado.corpo, { erro: "Token nao fornecido" });
        assert.equal((await listar({ ...usuarioA, perfil: "visitante" })).status, 403);
        assert.deepEqual(await fotografarFolha(banco, memoria), antes);
      });

    describe("com a RLS neutralizada, só o controller segura", () => {
      let troca;
      before(() => { troca = mock.method(contextoDb, "getStore", () => undefined); });
      after(() => troca.mock.restore());

      it("BUG (FOLHA-6) a listagem do A continua sem nenhuma linha do B (o filtro de escritório é do controller)",
        conhecido("BUG (FOLHA-6, #746, PR #762): rota inexistente na main"), async () => {
          const ids = await montar();
          assert.equal(await contar(banco, "processamentos_folha", { cliente_id: B.cliente.id }), 1, "dado do B presente");
          for (const perfil of [PERFIL.CLIENTE, PERFIL.FUNCIONARIO]) {
            const resposta = await listar(A.usuario(perfil), `?cliente_id=${B.cliente.id}`);
            assert.equal(resposta.status, 200, perfil);
            assert.deepEqual(resposta.corpo.processamentos.map(p => p.id).sort(), [ids.outubroAgente, ids.outubroWeb, ids.setembro].sort(), perfil);
          }
        });
    });
  });

  describe("FOLHA-7 (#747): retry idempotente, id inválido e token do agente", () => {
    it("BUG (FOLHA-7) retry de /gerar-saida com o holerite já no Storage e o vínculo perdido: 200, caminho regravado, download ok, sem recalcular",
      conhecido("BUG (FOLHA-7, #747, PR #755): o upload do retry usa upsert:false e recebe 'already exists': 500 para sempre, a folha nunca recupera"), async () => {
        const final = await folhaPronta(api, banco, usuarioA, [MARIA, JOSE]);
        const antes = await lerTabela(banco, "folha_calculos", "funcionario");
        const perdido = antes.find(c => c.funcionario === "Maria Sintetica");
        assert.ok(memoria.arquivos.has(perdido.holerite_path));
        const { error } = await banco.from("folha_calculos").update({ holerite_path: null }).eq("id", perdido.id);
        assert.equal(error, null);

        const resposta = await gerarSaida(final.id);
        assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
        assert.equal(resposta.corpo.holerites_gerados, 1);
        const depois = await lerTabela(banco, "folha_calculos", "funcionario");
        assert.equal(depois.length, antes.length, "o retry não recalcula nem duplica");
        assert.equal(depois.find(c => c.id === perdido.id).holerite_path, perdido.holerite_path);
        const baixado = await baixar(final.id, perdido.id);
        assert.equal(baixado.status, 200);
        assert.ok(ehPdf(baixado.corpo));
        assert.equal((await lerProcessamento(banco, final.id)).saida_status, "ok");
      });

    it("BUG (FOLHA-7) retry com a linha do relatório apagada e o PDF no Storage: 200 e uma linha por empresa",
      conhecido("BUG (FOLHA-7, #747, PR #755): mesmo upsert:false no relatório; o retry responde 500 'already exists'"), async () => {
        const final = await folhaPronta(api, banco, usuarioA, [MARIA, JOSE]);
        const antes = await lerTabela(banco, "folha_relatorios", "empresa");
        assert.equal(antes.length, 2);
        assert.equal((await banco.from("folha_relatorios").delete().eq("processamento_id", final.id)).error, null);

        const resposta = await gerarSaida(final.id);
        assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
        assert.equal(resposta.corpo.relatorios_gerados, 2);
        const depois = await lerTabela(banco, "folha_relatorios", "empresa");
        assert.deepEqual(depois.map(r => [r.empresa, r.arquivo_path]), antes.map(r => [r.empresa, r.arquivo_path]));
        for (const relatorio of depois) assert.equal((await baixar(final.id, relatorio.id)).status, 200);
      });

    it("BUG (FOLHA-7) duas empresas cujos nomes só diferem por acento (Pão x Pao) geram dois relatórios, cada um com o seu PDF",
      conhecido("BUG (FOLHA-7, #747, PR #755): o nome do relatório sanitiza igual; com upsert:false o 2º upload falha, e com upsert simples um sobrescreveria o outro (o fix põe um sufixo do nome bruto no caminho)"), async () => {
        const pao = linhaFolha({ empresa: "Padaria Pão Quente", funcionario: "Ana Sintetica", cpfBase: "750900021", salario: 2000 });
        const paoSemAcento = linhaFolha({ empresa: "Padaria Pao Quente", funcionario: "Bia Sintetica", cpfBase: "750900022", salario: 2500 });
        const final = await folhaPronta(api, banco, usuarioA, [pao, paoSemAcento]);
        const relatorios = await lerTabela(banco, "folha_relatorios", "empresa");
        assert.equal(relatorios.length, 2);
        assert.equal(new Set(relatorios.map(r => r.arquivo_path)).size, 2, "dois caminhos distintos");
        const baixados = [];
        for (const relatorio of relatorios) {
          const resposta = await baixar(final.id, relatorio.id);
          assert.equal(resposta.status, 200);
          assert.deepEqual(resposta.corpo, memoria.arquivos.get(relatorio.arquivo_path));
          baixados.push(resposta.corpo);
        }
        assert.notDeepEqual(baixados[0], baixados[1], "salários diferentes: o PDF de uma empresa não é o da outra");
      });

    const ROTAS_COM_ID = [["POST", "/folha/abc/calcular"], ["POST", "/folha/abc/gerar-saida"], ["GET", "/folha/abc"], ["GET", "/folha/abc/download/qualquer"]];
    it("BUG (FOLHA-7) processamento_id que não é UUID: as 4 rotas respondem 400 (não 500) e nada é gravado; deslogado segue 401",
      conhecido("BUG (FOLHA-7, #747, PR #755): o id vai direto à consulta, o Postgres recusa o tipo (22P02) e o handler devolve 500 'Erro ao buscar processamento'"), async () => {
        const antes = await fotografarFolha(banco, memoria);
        for (const [metodo, caminho] of ROTAS_COM_ID) {
          const resposta = await comoUsuario(api, usuarioA, caminho, metodo);
          assert.equal(resposta.status, 400, `${metodo} ${caminho}: ${JSON.stringify(resposta.corpo)}`);
          assert.match(resposta.corpo.erro, REGEX_UUID_INVALIDO_MSG, `${metodo} ${caminho}`);
          assert.equal((await api.requisitar(caminho, { metodo })).status, 401, `deslogado ${metodo} ${caminho}`);
        }
        assert.deepEqual(await fotografarFolha(banco, memoria), antes);
      });

    it("BUG (FOLHA-7) POST /folha/upload/agente confere o token ANTES de ler o arquivo: sem token ou com token falso, arquivo de tipo errado ou grande demais dá 401, não 400",
      conhecido("BUG (FOLHA-7, #747, PR #755; é o mesmo caso do skip PRB-E-44 de folha-upload-agente-http.test.js): o multer roda antes do controller validar o token, então quem não tem licença chega ao parse do upload e recebe 400 do multer"), async () => {
        const antes = await fotografarFolha(banco, memoria);
        const casos = [
          ["arquivo .csv", () => formularioFolha({ arquivo: Buffer.from("a,b"), nome: "folha.csv", tipo: "text/csv" })],
          ["arquivo acima de 10MB", () => formularioFolha({ arquivo: Buffer.alloc(10 * 1024 * 1024 + 1) })],
        ];
        for (const token of [undefined, "token-que-nao-existe"]) {
          for (const [rotulo, formulario] of casos) {
            const resposta = await enviarAgente(api, token, formulario());
            assert.equal(resposta.status, 401, `${token ?? "sem token"} + ${rotulo}: ${JSON.stringify(resposta.corpo)}`);
            assert.deepEqual(resposta.corpo, { erro: "Token de licença inválido ou expirado" });
          }
        }
        assert.deepEqual(await fotografarFolha(banco, memoria), antes);
      });
  });

  describe("FOLHA-8 (#748): o checklist do processo folha_pagamento avança com o pipeline", () => {
    const processosDoMes = async (clienteId, mes) =>
      (await lerTabela(banco, "processos", "criado_em", { cliente_id: clienteId, tipo: "folha_pagamento" })).filter(p => p.mes_referencia === mes);
    const etapasDe = processoId => lerTabela(banco, "etapas", "ordem", { processo_id: processoId });
    // As etapas de ordem 1 a 3 são as automáticas (planilha recebida, folha calculada, PDFs gerados).
    const automaticas = etapas => etapas.filter(e => e.ordem <= 3).map(e => e.concluida);
    const manuais = etapas => etapas.filter(e => e.ordem > 3).map(e => e.concluida);

    it("BUG (FOLHA-8) upload e pipeline completos: existe um processo da competência com as etapas 1, 2 e 3 concluídas e as manuais pendentes",
      conhecido("BUG (FOLHA-8, #748, PR #756): nenhum ponto do pipeline toca em processos/etapas; o checklist fica parado e o contador marca tudo à mão"), async () => {
        await folhaPronta(api, banco, usuarioA, [MARIA, JOSE], { mes: "2026-10" });
        const processos = await esperar("processo da competência", () => processosDoMes(A.cliente.id, "2026-10-01"), lista => lista.length > 0);
        assert.equal(processos.length, 1, "um processo por escritório e competência");
        const etapas = await esperar("etapas automáticas", () => etapasDe(processos[0].id), lista => lista.length > 0 && automaticas(lista).every(Boolean));
        assert.deepEqual(automaticas(etapas), [true, true, true]);
        assert.ok(manuais(etapas).length > 0 && manuais(etapas).every(c => c === false), "as etapas manuais seguem pendentes");
        assert.ok(etapas.filter(e => e.ordem <= 3).every(e => e.concluida_em));
        assert.equal((await processosDoMes(B.cliente.id, "2026-10-01")).length, 0, "o outro escritório não ganha processo");
      });

    it("BUG (FOLHA-8) planilha com erro no cálculo: só a etapa 'planilha recebida' conclui",
      conhecido("BUG (FOLHA-8, #748, PR #756): o checklist não avança em nenhum ponto"), async () => {
        const resposta = await enviarWeb(api, usuarioA, formularioFolha({ arquivo: await planilhaComErros(), mes: "2026-10" }));
        const final = await esperarPipeline(banco, resposta.corpo.processamento_id);
        assert.equal(final.status, "erro");
        const [processo] = await processosDoMes(A.cliente.id, "2026-10-01");
        assert.ok(processo, "o upload aceito cria o processo da competência");
        assert.deepEqual(automaticas(await etapasDe(processo.id)), [true, false, false]);
      });

    it("BUG (FOLHA-8) PDF que falha deixa a etapa 3 pendente; o retry de /gerar-saida conclui",
      conhecido("BUG (FOLHA-8, #748, PR #756): o checklist não avança em nenhum ponto"), async () => {
        memoria.bucket.falharSe = caminho => caminho.includes("/holerites/");
        const resposta = await enviarWeb(api, usuarioA, formularioFolha({ arquivo: await planilha([MARIA, JOSE]), mes: "2026-10" }));
        const comFalha = await esperarPipeline(banco, resposta.corpo.processamento_id);
        assert.equal(comFalha.saida_status, "erro");
        const [processo] = await processosDoMes(A.cliente.id, "2026-10-01");
        assert.ok(processo, "o upload aceito cria o processo da competência");
        assert.deepEqual(automaticas(await etapasDe(processo.id)), [true, true, false]);

        memoria.bucket.falharSe = null;
        assert.equal((await gerarSaida(comFalha.id)).status, 200);
        assert.deepEqual(automaticas(await etapasDe(processo.id)), [true, true, true]);
      });
  });
});
