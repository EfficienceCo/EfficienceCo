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
    eq() { return builder; },
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

beforeEach(() => filas.clear());

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
  it("200: lista sessões do cliente autenticado com extrato populado", async () => {
    queue("conciliacoes", "await", {
      data: [
        {
          id: CONCILIACAO_ID,
          mes: 8,
          ano: 2026,
          status: "em_andamento",
          total_transacoes: 45,
          total_conciliadas: 38,
          total_pendentes: 7,
          criado_em: "2026-08-01T00:00:00.000Z",
          extrato_id: "extrato-1",
        },
      ],
      error: null,
    });
    queue("extratos_bancarios", "await", {
      data: [{ id: "extrato-1", banco: "Itaú", conta: "1234" }],
      error: null,
    });

    const res = criarResposta();
    await listarConciliacoes(reqBase(), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].id, CONCILIACAO_ID);
    assert.equal(res.body[0].extrato_id, undefined);
    assert.deepEqual(res.body[0].extrato, { banco: "Itaú", conta: "1234" });
  });

  it("200: lista vazia quando não há sessões (não consulta extratos)", async () => {
    queue("conciliacoes", "await", { data: [], error: null });

    const res = criarResposta();
    await listarConciliacoes(reqBase(), res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, []);
  });

  it("400 quando cliente_id não pode ser resolvido", async () => {
    const res = criarResposta();
    await listarConciliacoes(reqBase({ usuario: { perfil: PERFIS.ADMIN_EFFICIENCE } }), res);
    assert.equal(res.statusCode, 400);
  });

  it("500 quando falha a busca das conciliações", async () => {
    queue("conciliacoes", "await", { data: null, error: { message: "falha" } });
    const res = criarResposta();
    await listarConciliacoes(reqBase(), res);
    assert.equal(res.statusCode, 500);
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
  it("200: retorna a sessão com pares agrupados por confiança", async () => {
    queueConciliacaoValida();
    queue("pares_conciliacao", "await", {
      data: [
        { id: "par-1", transacao_id: "t1", lancamento_id: "l1", confianca: "automatico", confirmado_por: null, confirmado_em: null },
        { id: "par-2", transacao_id: "t2", lancamento_id: "l2", confianca: "provavel", confirmado_por: null, confirmado_em: null },
        { id: "par-3", transacao_id: "t3", lancamento_id: null, confianca: "sem_par", confirmado_por: null, confirmado_em: null },
        { id: "par-4", transacao_id: null, lancamento_id: "l4", confianca: "sem_par", confirmado_por: null, confirmado_em: null },
      ],
      error: null,
    });
    queue("transacoes_extrato", "await", {
      data: [
        { id: "t1", valor: 100 },
        { id: "t2", valor: 50 },
        { id: "t3", valor: 30 },
      ],
      error: null,
    });
    queue("lancamentos_contabeis", "await", {
      data: [
        { id: "l1", valor: 100 },
        { id: "l2", valor: 50 },
        { id: "l4", valor: 999 },
      ],
      error: null,
    });

    const res = criarResposta();
    await buscarConciliacao(reqBase({ params: { id: CONCILIACAO_ID } }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.id, CONCILIACAO_ID);
    assert.equal(res.body.total_transacoes, 3);

    assert.equal(res.body.pares.automatico.length, 1);
    assert.equal(res.body.pares.automatico[0].transacao.id, "t1");
    assert.equal(res.body.pares.automatico[0].lancamento.id, "l1");
    assert.equal(res.body.pares.automatico[0].confirmado_por, undefined);

    assert.equal(res.body.pares.provavel.length, 1);
    assert.equal(res.body.pares.provavel[0].confirmado_por, null);

    assert.equal(res.body.pares.sem_par.length, 2);
    const semParTransacaoSemLancamento = res.body.pares.sem_par.find((p) => p.id === "par-3");
    assert.equal(semParTransacaoSemLancamento.transacao.id, "t3");
    assert.equal(semParTransacaoSemLancamento.lancamento, null);

    const semParLancamentoSemTransacao = res.body.pares.sem_par.find((p) => p.id === "par-4");
    assert.equal(semParLancamentoSemTransacao.transacao, null);
    assert.equal(semParLancamentoSemTransacao.lancamento.id, "l4");
  });

  it("200: sem pares não consulta transações nem lançamentos", async () => {
    queueConciliacaoValida();
    queue("pares_conciliacao", "await", { data: [], error: null });

    const res = criarResposta();
    await buscarConciliacao(reqBase({ params: { id: CONCILIACAO_ID } }), res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.pares, { automatico: [], provavel: [], sem_par: [] });
  });

  it("400 quando cliente_id não pode ser resolvido", async () => {
    const res = criarResposta();
    await buscarConciliacao(
      reqBase({ usuario: { perfil: PERFIS.ADMIN_EFFICIENCE }, params: { id: CONCILIACAO_ID } }),
      res,
    );
    assert.equal(res.statusCode, 400);
  });

  it("404 quando a conciliação não existe", async () => {
    queue("conciliacoes", "maybeSingle", { data: null, error: null });
    const res = criarResposta();
    await buscarConciliacao(reqBase({ params: { id: CONCILIACAO_ID } }), res);
    assert.equal(res.statusCode, 404);
  });

  it("404 quando a conciliação pertence a outro cliente", async () => {
    queueConciliacaoValida({ cliente_id: CLIENTE_B });
    const res = criarResposta();
    await buscarConciliacao(reqBase({ params: { id: CONCILIACAO_ID } }), res);
    assert.equal(res.statusCode, 404);
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
