import { describe, it, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import supabase from "../src/config/database.js";
import { PERFIS } from "../src/config/perfis.js";
import {
  criarLancamentoContabil,
  listarLancamentosContabeis,
  deletarLancamentoContabil,
} from "../src/controllers/lancamentos-contabeis.controller.js";
import { TAMANHO_PAGINA_POSTGREST } from "../src/utils/paginacao.util.js";

const CLIENTE_A = "11111111-1111-1111-1111-111111111111";
const CLIENTE_B = "22222222-2222-2222-2222-222222222222";
const LANCAMENTO_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

// ---------------------------------------------------------------------------
// Mock de supabase
// ---------------------------------------------------------------------------

const originalFrom = supabase.from;
const filas = new Map();
const ranges = [];
let ultimoPayload = null;
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
    insert(payload) { ultimoPayload = payload; return builder; },
    update(payload) { ultimoPayload = payload; return builder; },
    delete() { return builder; },
    eq() { return builder; },
    gte() { return builder; },
    lte() { return builder; },
    order() { return builder; },
    range(inicio, fim) { ranges.push([inicio, fim]); return builder; },
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
  ranges.length = 0;
  ultimoPayload = null;
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
    send(payload) { this.body = payload; return this; },
  };
}

function reqAdmin(body, overrides = {}) {
  return {
    body: body ?? {},
    params: {},
    query: {},
    usuario: { perfil: PERFIS.ADMIN_CLIENTE, cliente_id: CLIENTE_A },
    ...overrides,
  };
}

function payloadValido(overrides = {}) {
  return {
    cliente_id: CLIENTE_A,
    data_lancamento: "2026-08-05",
    valor: 1500.0,
    tipo: "debito",
    descricao: "Pagamento fornecedor ABC",
    categoria: "fornecedor",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// POST /lancamentos-contabeis
// ---------------------------------------------------------------------------

describe("POST /lancamentos-contabeis", () => {

  // Validação de entrada (#558): só a UI validava; a API aceitava lixo ou
  // devolvia 500 genérico.

  it("500 quando o Supabase retorna erro no insert", async () => {
    queue("lancamentos_contabeis", "single", { data: null, error: { message: "falha" } });

    const res = criarResposta();
    await criarLancamentoContabil(reqAdmin(payloadValido()), res);

    assert.equal(res.statusCode, 500);
  });
});

// ---------------------------------------------------------------------------
// GET /lancamentos-contabeis
// ---------------------------------------------------------------------------

describe("GET /lancamentos-contabeis", () => {
  it("devolve os lançamentos além do teto de 1000 do PostgREST (PRB-C-09, #696)", async () => {
    const primeira = Array.from({ length: TAMANHO_PAGINA_POSTGREST }, (_, i) => ({ id: `l${i}` }));
    queue("lancamentos_contabeis", "await", { data: primeira, error: null });
    queue("lancamentos_contabeis", "await", { data: [{ id: "l-alem-do-teto" }], error: null });

    const res = criarResposta();
    await listarLancamentosContabeis(reqAdmin(undefined, { query: { mes: "8", ano: "2026" } }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.length, TAMANHO_PAGINA_POSTGREST + 1);
    assert.equal(res.body.at(-1).id, "l-alem-do-teto");
    assert.deepEqual(ranges, [
      [0, TAMANHO_PAGINA_POSTGREST - 1],
      [TAMANHO_PAGINA_POSTGREST, TAMANHO_PAGINA_POSTGREST * 2 - 1],
    ]);
  });

  it("500 quando a página seguinte falha, sem devolver a lista cortada (PRB-C-09, #696)", async () => {
    queue("lancamentos_contabeis", "await", {
      data: Array.from({ length: TAMANHO_PAGINA_POSTGREST }, (_, i) => ({ id: `l${i}` })),
      error: null,
    });
    queue("lancamentos_contabeis", "await", { data: null, error: { message: "falha" } });

    const res = criarResposta();
    await listarLancamentosContabeis(reqAdmin(undefined, { query: {} }), res);

    assert.equal(res.statusCode, 500);
    assert.equal(Array.isArray(res.body), false);
  });

  it("500 quando o Supabase retorna erro", async () => {
    queue("lancamentos_contabeis", "await", { data: null, error: { message: "falha" } });

    const res = criarResposta();
    await listarLancamentosContabeis(reqAdmin(undefined, { query: {} }), res);

    assert.equal(res.statusCode, 500);
  });
});


// ---------------------------------------------------------------------------
// DELETE /lancamentos-contabeis/:id
// ---------------------------------------------------------------------------

describe("DELETE /lancamentos-contabeis/:id", () => {

  it("500 quando delete falha por outro motivo (não FK)", async () => {
    queue("lancamentos_contabeis", "single", {
      data: { id: LANCAMENTO_ID, cliente_id: CLIENTE_A, conciliado: false },
      error: null,
    });
    queue("lancamentos_contabeis", "await", {
      data: null,
      error: { code: "08000", message: "connection error" },
    });

    const res = criarResposta();
    await deletarLancamentoContabil(reqAdmin(undefined, { params: { id: LANCAMENTO_ID } }), res);

    assert.equal(res.statusCode, 500);
  });
});
