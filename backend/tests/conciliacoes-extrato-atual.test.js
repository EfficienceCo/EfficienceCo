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
// Registra os pares (coluna, valor) de cada .eq() encadeado, por tabela — usado
// pra provar que a consulta de conciliações do extrato NÃO filtra por status
// (regressão: filtrar só 'em_andamento' deixava conciliação já concluída
// passar batido e o extrato reaparecer depois do F5).
const chamadasEq = new Map();
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
    eq(coluna, valor) {
      if (!chamadasEq.has(tabela)) chamadasEq.set(tabela, []);
      chamadasEq.get(tabela).push([coluna, valor]);
      return builder;
    },
    order() { return builder; },
    range() { return builder; },
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

beforeEach(() => {
  filas.clear();
  chamadasEq.clear();
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

  it("500 quando falha a busca do extrato", async () => {
    queue("extratos_bancarios", "limit", { data: null, error: { message: "falha" } });

    const res = criarResposta();
    await buscarExtratoAtual(reqBase(), res);
    assert.equal(res.statusCode, 500);
  });

  it("500 quando falha a verificação de conciliação existente", async () => {
    queueExtratoEncontrado();
    queue("conciliacoes", "limit", { data: null, error: { message: "falha" } });

    const res = criarResposta();
    await buscarExtratoAtual(reqBase(), res);
    assert.equal(res.statusCode, 500);
  });

  it("500 quando falha a contagem de transações do extrato", async () => {
    queueExtratoEncontrado();
    queue("conciliacoes", "limit", { data: [], error: null });
    queue("transacoes_extrato", "await", { data: null, error: { message: "falha" } });

    const res = criarResposta();
    await buscarExtratoAtual(reqBase(), res);
    assert.equal(res.statusCode, 500);
  });
});
