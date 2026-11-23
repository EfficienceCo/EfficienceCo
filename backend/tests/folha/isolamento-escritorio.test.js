// TEST-FOLHA-2 (#750): o isolamento entre escritórios nas rotas com id da Folha (status, calcular,
// gerar-saída, download), com requisição HTTP de verdade e banco descartável de verdade. Contrato (#441):
// processamento de OUTRO escritório responde 404 com o MESMO corpo do id inexistente, e não muda nada.
//
// Há três camadas segurando esse 404, e cada uma tem de ter o teste dela, senão apagar uma não deixa nada
// vermelho (as outras duas cobrem o buraco):
//   1. a RLS do banco (SEG-1, migration 103): a consulta com o token do usuário nem enxerga a linha;
//   2. o filtro `.eq("cliente_id", ...)` da consulta (aplicarIsolamentoCliente, folha.controller.js);
//   3. a checagem de dono depois da consulta (processamentoPertenceAoCliente).
// Modos deste arquivo:
//   R  pilha completa, como em produção;
//   F  RLS neutralizada (o client da requisição vira o de serviço, como em conciliacao/filtros-controller-sem-rls):
//      sobram as camadas 2 e 3;
//   P  RLS neutralizada E o `.eq("cliente_id")` descartado pelo teste: sobra só a camada 3;
//   Q  espionagem: a consulta de cada handler leva o `.eq("cliente_id", <escritório do token>)`.
// Só dado sintético. O dado do B está presente em todos os cenários (folha pronta, só cálculo, só planilha).
import { describe, it, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import { contextoDb, criarDbDoUsuario } from "../../src/config/db-usuario.js";
import supabase from "../../src/config/database.js";
import { lerTabela } from "../helpers/banco.js";
import {
  iniciarBateriaFolha, folhaPronta, semearProcessamento, comoUsuario, fotografarFolha, espiarConsultas,
  UUID_INEXISTENTE, PERFIL, MARIA, JOSE, quinzeFuncionarios,
} from "../helpers/folha-http.js";

const ESCRITORIO = [PERFIL.CLIENTE, PERFIL.FUNCIONARIO];

describe("TEST-FOLHA-2: isolamento entre escritórios nas rotas com id da Folha (HTTP, banco real)", { timeout: 900_000 }, () => {
  let bateria; let api; let banco; let memoria; let A; let B;
  // Alvos do B (id do processamento) e o do A.
  let doB; let doA;

  before(async () => {
    bateria = await iniciarBateriaFolha();
    api = bateria.api;
    ({ banco, memoria, A, B } = await bateria.recriar());
    const usuarioB = B.usuario(PERFIL.CLIENTE);
    const f = quinzeFuncionarios();
    const pronto = await folhaPronta(api, banco, usuarioB, [f[0], f[1], f[8], f[9]]);
    const pendente = await semearProcessamento(banco, memoria, B.cliente, { mes: "2026-08-01" });
    const calculado = await semearProcessamento(banco, memoria, B.cliente, { mes: "2026-07-01" });
    const calculo = await comoUsuario(api, usuarioB, `/folha/${calculado.id}/calcular`, "POST");
    assert.equal(calculo.status, 200, JSON.stringify(calculo.corpo));
    const arquivosB = (await comoUsuario(api, usuarioB, `/folha/${pronto.id}`)).corpo.arquivos;
    doB = { pronto: pronto.id, pendente: pendente.id, calculado: calculado.id, arquivo: arquivosB.find(a => a.tipo === "holerite").id, relatorio: arquivosB.find(a => a.tipo === "relatorio").id };
    doA = (await folhaPronta(api, banco, A.usuario(PERFIL.CLIENTE), [MARIA, JOSE])).id;
  });
  after(() => bateria.encerrar());

  // [rótulo, alvo do B, pedido para um id (o do B ou o inexistente)]
  const ROTAS = [
    ["GET /folha/:id", () => doB.pronto, id => ({ caminho: `/folha/${id}` })],
    ["POST /folha/:id/calcular", () => doB.pendente, id => ({ metodo: "POST", caminho: `/folha/${id}/calcular` })],
    ["POST /folha/:id/gerar-saida", () => doB.calculado, id => ({ metodo: "POST", caminho: `/folha/${id}/gerar-saida` })],
    ["GET /folha/:id/download/:arquivo", () => doB.pronto, id => ({ caminho: `/folha/${id}/download/${id === UUID_INEXISTENTE ? UUID_INEXISTENTE : doB.arquivo}` })],
  ];
  const chamar = (usuario, { metodo = "GET", caminho }) => api.requisitar(caminho, { usuario, metodo });

  async function provar404Igual(rotulo, alvo, montar) {
    for (const perfil of ESCRITORIO) {
      const quem = `${perfil} do A em ${rotulo}`;
      const usuario = A.usuario(perfil);
      const processamentoDoB = (await banco.from("processamentos_folha").select("*").eq("id", alvo()).single()).data;
      assert.ok(processamentoDoB, "o alvo do B precisa existir");
      const antes = await fotografarFolha(banco, memoria);
      const inexistente = await chamar(usuario, montar(UUID_INEXISTENTE));
      const real = await chamar(usuario, montar(alvo()));
      assert.equal(inexistente.status, 404, `${quem}: id inexistente`);
      assert.deepEqual(inexistente.corpo, { erro: "Processamento não encontrado" }, `${quem}: corpo do inexistente`);
      assert.equal(real.status, 404, `${quem}: processamento do outro escritório`);
      assert.deepEqual(real.corpo, inexistente.corpo, `${quem}: mesmo corpo do inexistente`);
      assert.deepEqual(await fotografarFolha(banco, memoria), antes, `${quem}: nada pode mudar (tabelas e Storage)`);
      assert.deepEqual((await banco.from("processamentos_folha").select("*").eq("id", alvo()).single()).data, processamentoDoB, `${quem}: alvo intacto`);
    }
  }

  // Corpo comum dos modos R, F e P.
  function casosDeOutroEscritorio() {
    for (const [rotulo, alvo, montar] of ROTAS) {
      it(`${rotulo}: processamento do B responde o mesmo 404 do inexistente, com o dado do B presente e o banco intacto`, async () => {
        await provar404Igual(rotulo, alvo, montar);
      });
    }

    it("download: holerite ou relatório do B dentro de um processamento do A respondem o mesmo 404 do arquivo inexistente", async () => {
      for (const perfil of ESCRITORIO) {
        const antes = await fotografarFolha(banco, memoria);
        const usuario = A.usuario(perfil);
        const inexistente = await comoUsuario(api, usuario, `/folha/${doA}/download/${UUID_INEXISTENTE}`);
        assert.deepEqual([inexistente.status, inexistente.corpo], [404, { erro: "Arquivo não encontrado para este processamento" }], perfil);
        for (const [tipo, arquivo] of [["holerite", doB.arquivo], ["relatório", doB.relatorio]]) {
          const doBNoA = await comoUsuario(api, usuario, `/folha/${doA}/download/${arquivo}`);
          assert.deepEqual([doBNoA.status, doBNoA.corpo], [inexistente.status, inexistente.corpo], `${perfil}: ${tipo} do B`);
        }
        assert.deepEqual(await fotografarFolha(banco, memoria), antes, perfil);
      }
    });

    it("status do A lista só os arquivos do A (os do B existem e não aparecem)", async () => {
      const calculosB = (await lerTabela(banco, "folha_calculos")).filter(c => c.processamento_id === doB.pronto);
      assert.ok(calculosB.length > 0, "dado do B presente");
      for (const perfil of ESCRITORIO) {
        const resposta = await comoUsuario(api, A.usuario(perfil), `/folha/${doA}`);
        assert.equal(resposta.status, 200, perfil);
        assert.equal(resposta.corpo.total_funcionarios, 2, perfil);
        assert.equal(resposta.corpo.arquivos.length, 4, perfil);
        const idsDoB = new Set(calculosB.map(c => c.id));
        assert.ok(!resposta.corpo.arquivos.some(a => idsDoB.has(a.id)), `${perfil} do A recebeu arquivo do B`);
      }
    });

    it("gerar-saida do A não gera nem grava nada para o processamento do B que está só calculado", async () => {
      const processamento = await semearProcessamento(banco, memoria, A.cliente, { mes: "2026-06-01" });
      const usuario = A.usuario(PERFIL.CLIENTE);
      assert.equal((await comoUsuario(api, usuario, `/folha/${processamento.id}/calcular`, "POST")).status, 200);
      const calculosB = (await lerTabela(banco, "folha_calculos")).filter(c => c.processamento_id === doB.calculado);
      assert.ok(calculosB.length > 0 && calculosB.every(c => c.holerite_path === null), "dado do B presente, sem PDF");
      const resposta = await comoUsuario(api, usuario, `/folha/${processamento.id}/gerar-saida`, "POST");
      assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
      assert.equal(resposta.corpo.holerites_gerados, 2);
      assert.equal(resposta.corpo.relatorios_gerados, 2, "o relatório do B com o mesmo nome de empresa não pode valer para o A");
      const depoisB = (await lerTabela(banco, "folha_calculos")).filter(c => c.processamento_id === doB.calculado);
      assert.deepEqual(depoisB, calculosB, "os cálculos do B não podem ganhar PDF pelo pedido do A");
      assert.equal([...memoria.arquivos.keys()].filter(c => c.includes(`/${doB.calculado}/`)).length, 0);
    });
  }

  describe("R: pilha completa (RLS + filtro + checagem de dono)", () => {
    casosDeOutroEscritorio();

    it("admin_efficience é da equipe interna: enxerga o processamento de qualquer escritório (200)", async () => {
      const resposta = await comoUsuario(api, A.usuario(PERFIL.EFFICIENCE), `/folha/${doB.pronto}`);
      assert.equal(resposta.status, 200);
      assert.equal(resposta.corpo.processamento_id, doB.pronto);
      assert.equal(resposta.corpo.arquivos.length, 6);
    });

    it("o dono vê o dele: o filtro não bloqueia o B no próprio processamento (status e download)", async () => {
      const usuarioB = B.usuario(PERFIL.CLIENTE);
      assert.equal((await comoUsuario(api, usuarioB, `/folha/${doB.pronto}`)).status, 200);
      assert.equal((await comoUsuario(api, usuarioB, `/folha/${doB.pronto}/download/${doB.arquivo}`)).status, 200);
    });
  });

  describe("F: RLS neutralizada, só o controller segura (filtro + checagem de dono)", () => {
    let troca;
    before(() => { troca = mock.method(contextoDb, "getStore", () => undefined); });
    after(() => troca.mock.restore());

    it("controle: com a troca do client, a consulta de um usuário do A enxerga também o B (a RLS saiu de cena)", async () => {
      const usuario = A.usuario(PERFIL.CLIENTE);
      const comRls = await criarDbDoUsuario(usuario).from("processamentos_folha").select("cliente_id");
      assert.equal(comRls.error, null);
      assert.deepEqual([...new Set(comRls.data.map(p => p.cliente_id))], [A.cliente.id], "o client do usuário só vê o A");
      const semRls = await contextoDb.run(criarDbDoUsuario(usuario), () => supabase.from("processamentos_folha").select("cliente_id"));
      assert.deepEqual([...new Set(semRls.data.map(p => p.cliente_id))].sort(), [A.cliente.id, B.cliente.id].sort());
    });

    casosDeOutroEscritorio();
  });

  describe("P: RLS neutralizada e o .eq(cliente_id) descartado pelo teste, só a checagem de dono segura", () => {
    let troca; let espiao;
    before(() => {
      troca = mock.method(contextoDb, "getStore", () => undefined);
      espiao = espiarConsultas("processamentos_folha", { ignorarClienteId: true });
    });
    after(() => { espiao.restaurar(); troca.mock.restore(); });

    it("controle: o controller pediu o filtro de escritório e o teste o descartou (a linha do B chega ao handler)", async () => {
      espiao.registro.length = 0;
      const resposta = await comoUsuario(api, A.usuario(PERFIL.CLIENTE), `/folha/${doB.pronto}`);
      assert.equal(resposta.status, 404);
      assert.ok(espiao.registro.some(([coluna, valor]) => coluna === "cliente_id" && valor === A.cliente.id), JSON.stringify(espiao.registro));
      const semFiltro = await supabase.from("processamentos_folha").select("id").eq("id", doB.pronto).maybeSingle();
      assert.equal(semFiltro.data?.id, doB.pronto, "sem o filtro a consulta devolve a linha do B");
    });

    for (const [rotulo, alvo, montar] of ROTAS) {
      it(`${rotulo}: a linha do B chega ao handler e a checagem de dono responde o mesmo 404 do inexistente, sem mudar nada`, async () => {
        await provar404Igual(rotulo, alvo, montar);
      });
    }
  });

  describe("Q: a consulta de cada handler leva o filtro de escritório do token", () => {
    let espiao;
    before(() => { espiao = espiarConsultas("processamentos_folha"); });
    after(() => espiao.restaurar());

    for (const [rotulo, , montar] of ROTAS) {
      it(`${rotulo}: .eq("cliente_id", escritório do usuário) para admin_cliente e funcionario; admin_efficience sem filtro`, async () => {
        for (const perfil of ESCRITORIO) {
          espiao.registro.length = 0;
          const resposta = await chamar(A.usuario(perfil), montar(UUID_INEXISTENTE));
          assert.equal(resposta.status, 404, perfil);
          assert.ok(
            espiao.registro.some(([coluna, valor]) => coluna === "cliente_id" && valor === A.cliente.id),
            `${perfil}: a consulta de processamentos_folha saiu sem o filtro de escritório: ${JSON.stringify(espiao.registro)}`,
          );
          assert.ok(!espiao.registro.some(([coluna, valor]) => coluna === "cliente_id" && valor !== A.cliente.id), perfil);
        }
        espiao.registro.length = 0;
        await chamar(A.usuario(PERFIL.EFFICIENCE), montar(UUID_INEXISTENTE));
        assert.ok(espiao.registro.some(([coluna]) => coluna === "id"), "a consulta do admin_efficience ainda filtra pelo id");
        assert.ok(!espiao.registro.some(([coluna]) => coluna === "cliente_id"), "admin_efficience vê qualquer escritório: sem filtro de cliente");
      });
    }
  });
});
