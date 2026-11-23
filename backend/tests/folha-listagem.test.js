// FOLHA-6 (#746): listagem de processamentos no servidor. Supabase mockado: o que se
// prova aqui é o filtro por escritório, o vigente por competência e a origem/remetente.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import supabase from "../src/config/database.js";
import { PERFIS } from "../src/config/perfis.js";
import { listarProcessamentosFolha, consultarStatusFolha } from "../src/controllers/folha.controller.js";
import { marcarVigentes } from "../src/services/folha-listagem.service.js";

const CLIENTE_A = "11111111-1111-1111-1111-111111111111";
const USUARIO = "33333333-3333-3333-3333-333333333333";

const originalFrom = supabase.from;
let eqs;
let tabelas;

function builder(resultado) {
  const filtros = [];
  const linhas = () => {
    if (!Array.isArray(resultado.data)) return resultado;
    return {
      ...resultado,
      data: resultado.data.filter((l) => filtros.every(([col, val]) => (Array.isArray(val) ? val.includes(l[col]) : l[col] === val))),
    };
  };
  const b = {
    select: () => b,
    eq: (coluna, valor) => (eqs.push([coluna, valor]), filtros.push([coluna, valor]), b),
    in: (coluna, valores) => (filtros.push([coluna, valores]), b),
    order: () => b,
    limit: () => b,
    maybeSingle: () => Promise.resolve({ data: linhas().data?.[0] ?? null, error: linhas().error ?? null }),
    then: (resolve, reject) => Promise.resolve(linhas()).then(resolve, reject),
  };
  return b;
}

function res() {
  return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(p) { this.body = p; return this; } };
}

beforeEach(() => {
  eqs = [];
  tabelas = {};
  supabase.from = (tabela) => builder(tabelas[tabela] ?? { data: [], error: null });
});
afterEach(() => { supabase.from = originalFrom; });

const usuario = { id: USUARIO, perfil: PERFIS.FUNCIONARIO, cliente_id: CLIENTE_A };

describe("listarProcessamentosFolha", () => {
  it("filtra pelo escritório do token e devolve só o que a query trouxe", async () => {
    tabelas.processamentos_folha = { data: [], error: null };
    const r = res();
    await listarProcessamentosFolha({ usuario, query: {} }, r);
    assert.equal(r.statusCode, 200);
    assert.deepEqual(eqs, [["cliente_id", CLIENTE_A]]);
  });

  it("marca o mais recente da competência como vigente, mostra origem e nome de quem enviou", async () => {
    tabelas.processamentos_folha = {
      data: [
        { id: "p3", cliente_id: CLIENTE_A, mes_referencia: "2026-09-01", status: "concluido", origem: "agente", enviado_por: null, criado_em: "2026-10-03" },
        { id: "p2", cliente_id: CLIENTE_A, mes_referencia: "2026-09-01", status: "concluido", origem: "web", enviado_por: USUARIO, criado_em: "2026-10-02" },
        { id: "p1", cliente_id: CLIENTE_A, mes_referencia: "2026-08-01", status: "erro", origem: "web", enviado_por: USUARIO, criado_em: "2026-10-01" },
      ],
      error: null,
    };
    tabelas.usuarios = { data: [{ id: USUARIO, nome: "Joana" }], error: null };
    const r = res();
    await listarProcessamentosFolha({ usuario, query: {} }, r);
    const [p3, p2, p1] = r.body.processamentos;
    assert.deepEqual([p3.vigente, p2.vigente, p1.vigente], [true, false, true]);
    assert.equal(p3.origem, "agente");
    assert.equal(p3.enviado_por_nome, null);
    assert.equal(p2.enviado_por_nome, "Joana");
    assert.equal(p2.enviado_por, undefined, "id do usuário não vaza na resposta");
  });

  it("status da lista é o mesmo do GET /:id: calculado vira processando ou erro", async () => {
    tabelas.processamentos_folha = {
      data: [
        { id: "p3", cliente_id: CLIENTE_A, mes_referencia: "2026-09-01", status: "calculado", saida_status: "erro", origem: "web", enviado_por: null, criado_em: "2026-10-03" },
        { id: "p2", cliente_id: CLIENTE_A, mes_referencia: "2026-08-01", status: "calculado", saida_status: "pendente", origem: "web", enviado_por: null, criado_em: "2026-10-02" },
        { id: "p1", cliente_id: CLIENTE_A, mes_referencia: "2026-07-01", status: "concluido", saida_status: "ok", origem: "web", enviado_por: null, criado_em: "2026-10-01" },
      ],
      error: null,
    };
    const r = res();
    await listarProcessamentosFolha({ usuario, query: {} }, r);
    assert.deepEqual(r.body.processamentos.map((p) => p.status), ["erro", "processando", "concluido"]);
  });

  it("outro escritório com dado presente: não aparece na lista nem some do dono", async () => {
    const CLIENTE_B = "22222222-2222-2222-2222-222222222222";
    tabelas.processamentos_folha = {
      data: [
        { id: "a1", cliente_id: CLIENTE_A, mes_referencia: "2026-09-01", status: "concluido", origem: "web", enviado_por: null, criado_em: "2026-10-01" },
        { id: "b1", cliente_id: CLIENTE_B, mes_referencia: "2026-09-01", status: "concluido", origem: "agente", enviado_por: null, criado_em: "2026-10-02" },
      ],
      error: null,
    };
    const rA = res();
    await listarProcessamentosFolha({ usuario, query: {} }, rA);
    assert.deepEqual(rA.body.processamentos.map((p) => p.id), ["a1"]);
    assert.equal(rA.body.processamentos[0].vigente, true, "o processamento do outro escritório não tira o vigente");

    const rB = res();
    await listarProcessamentosFolha({ usuario: { ...usuario, cliente_id: CLIENTE_B }, query: {} }, rB);
    assert.deepEqual(rB.body.processamentos.map((p) => p.id), ["b1"]);
  });

  it("recusa mes_referencia fora do formato e admin sem cliente_id", async () => {
    const r1 = res();
    await listarProcessamentosFolha({ usuario, query: { mes_referencia: "09/2026" } }, r1);
    assert.equal(r1.statusCode, 400);
    const r2 = res();
    await listarProcessamentosFolha({ usuario: { perfil: PERFIS.ADMIN_EFFICIENCE }, query: {} }, r2);
    assert.equal(r2.statusCode, 400);
  });

  it("erro do banco vira 500 sem vazar a mensagem", async () => {
    tabelas.processamentos_folha = { data: null, error: { message: "falha interna" } };
    const r = res();
    await listarProcessamentosFolha({ usuario, query: {} }, r);
    assert.equal(r.statusCode, 500);
    assert.doesNotMatch(JSON.stringify(r.body), /falha interna/);
  });
});

describe("consultarStatusFolha: empresa e funcionário por arquivo", () => {
  it("cada arquivo traz empresa e funcionário, sem CPF nem path de storage", async () => {
    tabelas.processamentos_folha = {
      data: [{ id: "p1", cliente_id: CLIENTE_A, status: "concluido", mes_referencia: "2026-09-01", motivo_erro: null, saida_status: "ok" }],
      error: null,
    };
    tabelas.folha_calculos = {
      data: [
        { id: "c1", processamento_id: "p1", empresa: "Padaria", funcionario: "João", holerite_path: "x/holerite_c1.pdf" },
        { id: "c2", processamento_id: "p1", empresa: "Mercado", funcionario: "Maria", holerite_path: "x/holerite_c2.pdf" },
      ],
      error: null,
    };
    tabelas.folha_relatorios = {
      data: [{ id: "r1", processamento_id: "p1", empresa: "Padaria", arquivo_path: "x/relatorio_padaria.pdf" }],
      error: null,
    };
    const r = res();
    await consultarStatusFolha({ usuario, params: { processamento_id: "p1" } }, r);
    assert.equal(r.statusCode, 200);
    const porId = Object.fromEntries(r.body.arquivos.map((a) => [a.id, a]));
    assert.equal(porId.c1.empresa, "Padaria");
    assert.equal(porId.c1.funcionario, "João");
    assert.equal(porId.c2.empresa, "Mercado");
    assert.equal(porId.r1.empresa, "Padaria");
    assert.ok(r.body.arquivos.every((a) => a.path === undefined));
  });

  it("processamento de outro escritório continua 404", async () => {
    tabelas.processamentos_folha = {
      data: [{ id: "p1", cliente_id: "22222222-2222-2222-2222-222222222222", status: "concluido", mes_referencia: "2026-09-01" }],
      error: null,
    };
    const r = res();
    await consultarStatusFolha({ usuario, params: { processamento_id: "p1" } }, r);
    assert.equal(r.statusCode, 404);
  });
});

describe("marcarVigentes", () => {
  it("só o primeiro de cada competência é vigente", () => {
    const lista = marcarVigentes([
      { mes_referencia: "2026-09-01" }, { mes_referencia: "2026-09-01" }, { mes_referencia: "2026-10-01" },
    ]);
    assert.deepEqual(lista.map((p) => p.vigente), [true, false, true]);
  });
});
