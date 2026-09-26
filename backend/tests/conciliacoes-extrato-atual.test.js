import { describe, it, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import supabase from "../src/config/database.js";
import { PERFIS } from "../src/config/perfis.js";
import { buscarExtratoAtual } from "../src/controllers/conciliacoes.controller.js";

const CLIENTE_A = "11111111-1111-1111-1111-111111111111";
const EXTRATO_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

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
    eq() { return builder; },
    order() { return builder; },
    limit() { return Promise.resolve(consumir("limit", { data: [], error: null })); },
    maybeSingle() { return Promise.resolve(consumir("maybeSingle", { data: null, error: null })); },
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
    usuario: { perfil: PERFIS.ADMIN_CLIENTE, cliente_id: CLIENTE_A },
    query: { mes: "8", ano: "2026" },
    ...overrides,
  };
}

function queueExtratoEncontrado(overrides = {}) {
  queue("extratos_bancarios", "limit", {
    data: [
      {
        id: EXTRATO_ID,
        banco: "Itaú",
        conta: "1234",
        criado_em: "2026-08-05T12:00:00.000Z",
        ...overrides,
      },
    ],
    error: null,
  });
}

// ---------------------------------------------------------------------------
// GET /conciliacoes/extrato
// ---------------------------------------------------------------------------

describe("GET /conciliacoes/extrato", () => {
  it("200: retorna o extrato processado mais recente do período sem conciliação em andamento", async () => {
    queueExtratoEncontrado();
    queue("conciliacoes", "maybeSingle", { data: null, error: null });
    queue("transacoes_extrato", "await", {
      data: [{ id: "t1" }, { id: "t2" }, { id: "t3" }],
      error: null,
    });

    const res = criarResposta();
    await buscarExtratoAtual(reqBase(), res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
      extrato: {
        extrato_id: EXTRATO_ID,
        banco: "Itaú",
        conta: "1234",
        total_transacoes: 3,
        enviado_em: "2026-08-05T12:00:00.000Z",
      },
    });
  });

  it("200: extrato null quando não há extrato processado para o período", async () => {
    queue("extratos_bancarios", "limit", { data: [], error: null });

    const res = criarResposta();
    await buscarExtratoAtual(reqBase(), res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { extrato: null });
  });

  it("200: extrato null quando já existe conciliação em andamento pra esse extrato (evita duplicar sessão)", async () => {
    queueExtratoEncontrado();
    queue("conciliacoes", "maybeSingle", { data: { id: "conciliacao-1" }, error: null });

    const res = criarResposta();
    await buscarExtratoAtual(reqBase(), res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { extrato: null });
  });

  it("400 quando cliente_id não pode ser resolvido", async () => {
    const res = criarResposta();
    await buscarExtratoAtual(reqBase({ usuario: { perfil: PERFIS.ADMIN_EFFICIENCE } }), res);
    assert.equal(res.statusCode, 400);
  });

  it("400 quando mes/ano não são informados ou são inválidos", async () => {
    const res = criarResposta();
    await buscarExtratoAtual(reqBase({ query: {} }), res);
    assert.equal(res.statusCode, 400);

    const res2 = criarResposta();
    await buscarExtratoAtual(reqBase({ query: { mes: "13", ano: "2026" } }), res2);
    assert.equal(res2.statusCode, 400);
  });

  it("500 quando falha a busca do extrato", async () => {
    queue("extratos_bancarios", "limit", { data: null, error: { message: "falha" } });

    const res = criarResposta();
    await buscarExtratoAtual(reqBase(), res);
    assert.equal(res.statusCode, 500);
  });

  it("500 quando falha a verificação de conciliação em andamento", async () => {
    queueExtratoEncontrado();
    queue("conciliacoes", "maybeSingle", { data: null, error: { message: "falha" } });

    const res = criarResposta();
    await buscarExtratoAtual(reqBase(), res);
    assert.equal(res.statusCode, 500);
  });

  it("500 quando falha a contagem de transações do extrato", async () => {
    queueExtratoEncontrado();
    queue("conciliacoes", "maybeSingle", { data: null, error: null });
    queue("transacoes_extrato", "await", { data: null, error: { message: "falha" } });

    const res = criarResposta();
    await buscarExtratoAtual(reqBase(), res);
    assert.equal(res.statusCode, 500);
  });
});
