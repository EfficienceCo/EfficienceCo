import { describe, it, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import supabase from "../src/config/database.js";
import { PERFIS } from "../src/config/perfis.js";
import { criarConciliacao } from "../src/controllers/conciliacoes.controller.js";

const CLIENTE_A = "11111111-1111-1111-1111-111111111111";
const CLIENTE_B = "22222222-2222-2222-2222-222222222222";
const EXTRATO_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CONCILIACAO_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

// ---------------------------------------------------------------------------
// Mock de supabase
// ---------------------------------------------------------------------------

const originalFrom = supabase.from;
const filas = new Map();
// Registra os pares (coluna, valor) de cada .eq() encadeado, por tabela — usado
// pra provar que a consulta de conciliações existentes do extrato NÃO filtra
// por status (regressão: filtrar só 'em_andamento' deixava uma segunda sessão
// ser criada pra um extrato já conciliado, duplicando pares/totais).
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
    insert() { return builder; },
    update() { return builder; },
    delete() { return builder; },
    eq(coluna, valor) {
      if (!chamadasEq.has(tabela)) chamadasEq.set(tabela, []);
      chamadasEq.get(tabela).push([coluna, valor]);
      return builder;
    },
    gte() { return builder; },
    lte() { return builder; },
    order() { return builder; },
    range() { return builder; },
    limit() { return Promise.resolve(consumir("limit", { data: [], error: null })); },
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
    body: { extrato_id: EXTRATO_ID, mes: 7, ano: 2026 },
    query: {},
    ...overrides,
  };
}

function queueExtratoValido(overrides = {}) {
  queue("extratos_bancarios", "maybeSingle", {
    data: { id: EXTRATO_ID, cliente_id: CLIENTE_A, status: "processado", mes: 7, ano: 2026, ...overrides },
    error: null,
  });
}

// ---------------------------------------------------------------------------
// POST /conciliacoes
// ---------------------------------------------------------------------------

describe("POST /conciliacoes", () => {

  it("500 quando falha a busca de transações do extrato", async () => {
    queueExtratoValido();
    queue("transacoes_extrato", "await", { data: null, error: { message: "falha" } });
    const res = criarResposta();
    await criarConciliacao(reqBase(), res);
    assert.equal(res.statusCode, 500);
  });

  it("500 quando falha a busca de lançamentos contábeis", async () => {
    queueExtratoValido();
    queue("transacoes_extrato", "await", { data: [], error: null });
    queue("lancamentos_contabeis", "await", { data: null, error: { message: "falha" } });
    const res = criarResposta();
    await criarConciliacao(reqBase(), res);
    assert.equal(res.statusCode, 500);
  });

  it("500 e remove a conciliação criada quando falha o insert de pares_conciliacao", async () => {
    queueExtratoValido();
    queue("transacoes_extrato", "await", {
      data: [{ id: "t1", tipo: "credito", valor: 100, data_lancamento: "2026-07-01" }],
      error: null,
    });
    queue("lancamentos_contabeis", "await", { data: [], error: null });
    queue("conciliacoes", "single", { data: { id: CONCILIACAO_ID }, error: null });
    queue("pares_conciliacao", "await", { data: null, error: { message: "falha ao inserir" } });

    let idDeletado = null;
    const originalFromLocal = supabase.from;
    supabase.from = function (tabela) {
      const b = originalFromLocal(tabela);
      if (tabela === "conciliacoes") {
        const deleteOriginal = b.delete.bind(b);
        b.delete = () => {
          const deletado = deleteOriginal();
          const eqOriginal = deletado.eq.bind(deletado);
          deletado.eq = (campo, valor) => { if (campo === "id") idDeletado = valor; return eqOriginal(campo, valor); };
          return deletado;
        };
      }
      return b;
    };
    queue("conciliacoes", "await", { data: null, error: null }); // delete

    const res = criarResposta();
    await criarConciliacao(reqBase(), res);
    supabase.from = originalFromLocal;

    assert.equal(res.statusCode, 500);
    assert.equal(idDeletado, CONCILIACAO_ID);
  });
});
