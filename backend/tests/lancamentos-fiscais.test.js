import { describe, it, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import supabase from "../src/config/database.js";
import { PERFIS } from "../src/config/perfis.js";
import {
  criarLancamentoFiscal,
  listarLancamentosFiscais,
  resumoLancamentosFiscais,
} from "../src/controllers/lancamentos-fiscais.controller.js";

const CLIENTE_ID = "11111111-1111-1111-1111-111111111111";

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
    eq() { return builder; },
    gte() { return builder; },
    lte() { return builder; },
    order() { return builder; },
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

function tokenValido(override = {}) {
  queue("licencas", "single", {
    data: { cliente_id: CLIENTE_ID, ativa: true, validade: "2099-12-31", ...override },
    error: null,
  });
}

function payloadValido(overrides = {}) {
  return {
    chave_nfe: "35240612345678000190550010000000011234567890",
    tipo: "saida",
    cnpj_emitente: "12345678000190",
    cnpj_destinatario: "98765432000155",
    valor_total: 1000.5,
    data_emissao: "2026-07-15",
    cliente_id: CLIENTE_ID,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// POST /lancamentos-fiscais
// ---------------------------------------------------------------------------

describe("POST /lancamentos-fiscais", () => {
  it("201 e persiste quando payload válido e chave_nfe inédita", async () => {
    tokenValido();
    queue("lancamentos_fiscais", "maybeSingle", { data: null, error: null });
    queue("lancamentos_fiscais", "single", { data: { id: "novo-id", ...payloadValido() }, error: null });

    const req = { headers: { "x-licenca-token": "tok" }, body: payloadValido() };
    const res = criarResposta();
    await criarLancamentoFiscal(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.id, "novo-id");
  });

  it("409 quando chave_nfe já existe", async () => {
    tokenValido();
    queue("lancamentos_fiscais", "maybeSingle", { data: { id: "existente" }, error: null });

    const req = { headers: { "x-licenca-token": "tok" }, body: payloadValido() };
    const res = criarResposta();
    await criarLancamentoFiscal(req, res);

    assert.equal(res.statusCode, 409);
  });

  it("409 quando insert colide por unique_violation (corrida entre chamadas concorrentes)", async () => {
    tokenValido();
    queue("lancamentos_fiscais", "maybeSingle", { data: null, error: null });
    queue("lancamentos_fiscais", "single", {
      data: null,
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    });

    const req = { headers: { "x-licenca-token": "tok" }, body: payloadValido() };
    const res = criarResposta();
    await criarLancamentoFiscal(req, res);

    assert.equal(res.statusCode, 409);
  });

  it("401 quando token de agente inválido", async () => {
    queue("licencas", "single", { data: null, error: null });

    const req = { headers: { "x-licenca-token": "invalido" }, body: payloadValido() };
    const res = criarResposta();
    await criarLancamentoFiscal(req, res);

    assert.equal(res.statusCode, 401);
  });

  it("400 quando campo obrigatório está faltando", async () => {
    tokenValido();
    const { chave_nfe, ...semChave } = payloadValido();

    const req = { headers: { "x-licenca-token": "tok" }, body: semChave };
    const res = criarResposta();
    await criarLancamentoFiscal(req, res);

    assert.equal(res.statusCode, 400);
    assert.ok(res.body.faltando.includes("chave_nfe"));
  });

  it("400 quando tipo não é entrada nem saida", async () => {
    tokenValido();

    const req = {
      headers: { "x-licenca-token": "tok" },
      body: payloadValido({ tipo: "transferencia" }),
    };
    const res = criarResposta();
    await criarLancamentoFiscal(req, res);

    assert.equal(res.statusCode, 400);
  });

  it("403 quando cliente_id do payload não pertence ao token", async () => {
    tokenValido();

    const req = {
      headers: { "x-licenca-token": "tok" },
      body: payloadValido({ cliente_id: "22222222-2222-2222-2222-222222222222" }),
    };
    const res = criarResposta();
    await criarLancamentoFiscal(req, res);

    assert.equal(res.statusCode, 403);
  });
});

// ---------------------------------------------------------------------------
// GET /lancamentos-fiscais
// ---------------------------------------------------------------------------

describe("GET /lancamentos-fiscais", () => {
  function reqBase(overrides = {}) {
    return {
      usuario: { perfil: PERFIS.ADMIN_CLIENTE, cliente_id: CLIENTE_ID },
      query: {},
      ...overrides,
    };
  }

  it("200 com a lista de lançamentos do cliente", async () => {
    queue("lancamentos_fiscais", "await", {
      data: [
        { id: "1", data_emissao: "2026-07-20" },
        { id: "2", data_emissao: "2026-07-10" },
      ],
      error: null,
    });

    const res = criarResposta();
    await listarLancamentosFiscais(reqBase(), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.length, 2);
  });

  it("400 quando clienteId ausente (perfil admin_efficience sem query)", async () => {
    const req = reqBase({ usuario: { perfil: PERFIS.ADMIN_EFFICIENCE }, query: {} });
    const res = criarResposta();
    await listarLancamentosFiscais(req, res);

    assert.equal(res.statusCode, 400);
  });

  it("500 quando o Supabase retorna erro", async () => {
    queue("lancamentos_fiscais", "await", { data: null, error: { message: "falha" } });

    const res = criarResposta();
    await listarLancamentosFiscais(reqBase(), res);

    assert.equal(res.statusCode, 500);
  });
});

// ---------------------------------------------------------------------------
// GET /lancamentos-fiscais/resumo
// ---------------------------------------------------------------------------

describe("GET /lancamentos-fiscais/resumo", () => {
  function reqBase(overrides = {}) {
    return {
      usuario: { perfil: PERFIS.ADMIN_CLIENTE, cliente_id: CLIENTE_ID },
      query: {},
      ...overrides,
    };
  }

  it("200 com totais agregados corretos", async () => {
    queue("lancamentos_fiscais", "await", {
      data: [
        { tipo: "entrada", valor_total: 100, icms: 10, pis: 1, cofins: 2, ipi: 0 },
        { tipo: "saida", valor_total: 200, icms: 20, pis: 2, cofins: 4, ipi: 5 },
        { tipo: "saida", valor_total: 50, icms: 5, pis: 0.5, cofins: 1, ipi: 0 },
      ],
      error: null,
    });

    const res = criarResposta();
    await resumoLancamentosFiscais(reqBase(), res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
      total_nfe: 3,
      valor_total: 350,
      icms: 35,
      pis: 3.5,
      cofins: 7,
      ipi: 5,
      entradas: 1,
      saidas: 2,
    });
  });

  it("200 com zeros quando não há lançamentos no período", async () => {
    queue("lancamentos_fiscais", "await", { data: [], error: null });

    const res = criarResposta();
    await resumoLancamentosFiscais(reqBase(), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.total_nfe, 0);
    assert.equal(res.body.valor_total, 0);
  });

  it("400 quando clienteId ausente", async () => {
    const req = reqBase({ usuario: { perfil: PERFIS.ADMIN_EFFICIENCE }, query: {} });
    const res = criarResposta();
    await resumoLancamentosFiscais(req, res);

    assert.equal(res.statusCode, 400);
  });
});
