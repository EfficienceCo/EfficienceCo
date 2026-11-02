import { describe, it, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import supabase from "../src/config/database.js";
import { PERFIS } from "../src/config/perfis.js";
import { listarConciliacoes, buscarConciliacao } from "../src/controllers/conciliacoes.controller.js";

const CLIENTE_A = "11111111-1111-1111-1111-111111111111";
const CLIENTE_B = "22222222-2222-2222-2222-222222222222";
const CONCILIACAO_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const USUARIO_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";

// ---------------------------------------------------------------------------
// Mock de supabase
// ---------------------------------------------------------------------------

const originalFrom = supabase.from;
const filas = new Map();
const filtrosEq = [];
function chave(t, m) { return `${t}:${m}`; }
function queue(tabela, metodo, resultado) {
  const k = chave(tabela, metodo);
  if (!filas.has(k)) filas.set(k, []);
  filas.get(k).push(resultado);
}

supabase.from = function (tabela) {
  const consumir = (metodo, fallback) => {
    const k = chave(tabela, metodo);
    const fila = filas.get(k);
    if (!fila || fila.length === 0) return fallback;
    return fila.shift();
  };
  const builder = {
    select() { return builder; },
    insert() { return builder; },
    update() { return builder; },
    delete() { return builder; },
    eq(coluna, valor) { filtrosEq.push([coluna, valor]); return builder; },
    gte() { return builder; },
    lte() { return builder; },
    in() { return builder; },
    is() { return builder; },
    order() { return builder; },
    range() { return builder; },
    maybeSingle() { return Promise.resolve(consumir("maybeSingle", { data: null, error: null })); },
    single() { return Promise.resolve(consumir("single", { data: null, error: null })); },
    then(resolve, reject) {
      return Promise.resolve(consumir("await", { data: [], error: null })).then(resolve, reject);
    },
  };
  return builder;
};

after(() => {
  supabase.from = originalFrom;
});

beforeEach(() => {
  filas.clear();
  filtrosEq.length = 0;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function criarResposta() {
  return {
    statusCode: null,
    body: null,
    status(codigo) { this.statusCode = codigo; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

function reqBase(overrides = {}) {
  return {
    usuario: { id: USUARIO_ID, perfil: PERFIS.ADMIN_CLIENTE, cliente_id: CLIENTE_A },
    params: {},
    body: {},
    query: {},
    ...overrides,
  };
}

function queueConciliacaoValida(overrides = {}) {
  queue("conciliacoes", "maybeSingle", {
    data: {
      id: CONCILIACAO_ID,
      cliente_id: CLIENTE_A,
      status: "em_andamento",
      total_transacoes: 3,
      total_conciliadas: 1,
      total_pendentes: 2,
      ...overrides,
    },
    error: null,
  });
}

// ---------------------------------------------------------------------------
// GET /conciliacoes
// ---------------------------------------------------------------------------

describe("GET /conciliacoes", () => {

  it("500 quando falha a busca das conciliações", async () => {
    queue("conciliacoes", "await", { data: null, error: { message: "falha" } });
    const res = criarResposta();
    await listarConciliacoes(reqBase(), res);
    assert.equal(res.statusCode, 500);
  });

  for (const mes of ["0", "13", "abc"]) {
    it(`400 quando mes=${mes} (PRB-C-09, #696)`, async () => {
      const res = criarResposta();
      await listarConciliacoes(reqBase({ query: { mes, ano: "2026" } }), res);

      assert.equal(res.statusCode, 400);
      assert.match(res.body.erro, /mes deve ser um inteiro entre 1 e 12/);
      assert.equal(filtrosEq.length, 0);
    });
  }

  for (const ano of ["0", "abc", "-1"]) {
    it(`400 quando ano=${ano} (PRB-C-09, #696)`, async () => {
      const res = criarResposta();
      await listarConciliacoes(reqBase({ query: { ano } }), res);

      assert.equal(res.statusCode, 400);
      assert.match(res.body.erro, /ano deve ser um inteiro positivo/);
      assert.equal(filtrosEq.length, 0);
    });
  }

  it("200 quando mes e ano são válidos e aplica os dois filtros", async () => {
    queue("conciliacoes", "await", {
      data: [{ id: CONCILIACAO_ID, mes: 8, ano: 2026, extrato_id: null }],
      error: null,
    });

    const res = criarResposta();
    await listarConciliacoes(reqBase({ query: { mes: "8", ano: "2026" } }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.length, 1);
    assert.ok(filtrosEq.some(([coluna, valor]) => coluna === "mes" && valor === 8));
    assert.ok(filtrosEq.some(([coluna, valor]) => coluna === "ano" && valor === 2026));
  });

  it("200 quando só o mês vem informado", async () => {
    queue("conciliacoes", "await", { data: [], error: null });

    const res = criarResposta();
    await listarConciliacoes(reqBase({ query: { mes: "8" } }), res);

    assert.equal(res.statusCode, 200);
    assert.ok(filtrosEq.some(([coluna, valor]) => coluna === "mes" && valor === 8));
    assert.equal(filtrosEq.some(([coluna]) => coluna === "ano"), false);
  });

  it("500 quando falha a busca dos extratos", async () => {
    queue("conciliacoes", "await", {
      data: [{ id: CONCILIACAO_ID, extrato_id: "extrato-1" }],
      error: null,
    });
    queue("extratos_bancarios", "await", { data: null, error: { message: "falha" } });
    const res = criarResposta();
    await listarConciliacoes(reqBase(), res);
    assert.equal(res.statusCode, 500);
  });
});

// ---------------------------------------------------------------------------
// GET /conciliacoes/:id
// ---------------------------------------------------------------------------

describe("GET /conciliacoes/:id", () => {

  it("200: extrato null quando a conciliação não tem extrato_id", async () => {
    queueConciliacaoValida();
    queue("pares_conciliacao", "await", { data: [], error: null });

    const res = criarResposta();
    await buscarConciliacao(reqBase({ params: { id: CONCILIACAO_ID } }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.extrato, null);
  });

  it("500 quando falha a busca do extrato", async () => {
    queueConciliacaoValida({ extrato_id: "extrato-1" });
    queue("pares_conciliacao", "await", { data: [], error: null });
    queue("extratos_bancarios", "maybeSingle", { data: null, error: { message: "falha" } });

    const res = criarResposta();
    await buscarConciliacao(reqBase({ params: { id: CONCILIACAO_ID } }), res);

    assert.equal(res.statusCode, 500);
  });

  it("500 quando falha a busca dos pares", async () => {
    queueConciliacaoValida();
    queue("pares_conciliacao", "await", { data: null, error: { message: "falha" } });
    const res = criarResposta();
    await buscarConciliacao(reqBase({ params: { id: CONCILIACAO_ID } }), res);
    assert.equal(res.statusCode, 500);
  });

  it("500 quando falha a busca das transações", async () => {
    queueConciliacaoValida();
    queue("pares_conciliacao", "await", {
      data: [{ id: "par-1", transacao_id: "t1", lancamento_id: null, confianca: "sem_par", confirmado_por: null, confirmado_em: null }],
      error: null,
    });
    queue("transacoes_extrato", "await", { data: null, error: { message: "falha" } });
    const res = criarResposta();
    await buscarConciliacao(reqBase({ params: { id: CONCILIACAO_ID } }), res);
    assert.equal(res.statusCode, 500);
  });

  it("500 quando falha a busca dos lançamentos", async () => {
    queueConciliacaoValida();
    queue("pares_conciliacao", "await", {
      data: [{ id: "par-1", transacao_id: null, lancamento_id: "l1", confianca: "sem_par", confirmado_por: null, confirmado_em: null }],
      error: null,
    });
    queue("lancamentos_contabeis", "await", { data: null, error: { message: "falha" } });
    const res = criarResposta();
    await buscarConciliacao(reqBase({ params: { id: CONCILIACAO_ID } }), res);
    assert.equal(res.statusCode, 500);
  });
});
