import { describe, it, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import supabase from "../src/config/database.js";
import { PERFIS } from "../src/config/perfis.js";
import { buscarEficiencia } from "../src/controllers/eficiencia.controller.js";

const CLIENTE_ID = "11111111-1111-1111-1111-111111111111";

// ---------------------------------------------------------------------------
// Mock de supabase — mesmo padrão de lancamentos-fiscais.test.js
// ---------------------------------------------------------------------------

const originalFrom = supabase.from;
const filas = new Map();
let chamadasGte = [];

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
    gte(campo, valor) { chamadasGte.push([campo, valor]); return builder; },
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
  chamadasGte = [];
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
    usuario: { perfil: PERFIS.ADMIN_CLIENTE, cliente_id: CLIENTE_ID },
    query: {},
    body: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// GET /eficiencia
// ---------------------------------------------------------------------------

describe("GET /eficiencia", () => {
  it("200 com total_horas e total_execucoes corretos para múltiplos eventos", async () => {
    queue("eventos", "await", {
      data: [{ id: "1" }, { id: "2" }, { id: "3" }],
      error: null,
    });

    const res = criarResposta();
    await buscarEficiencia(reqBase(), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.total_execucoes, 3);
    assert.equal(res.body.total_horas, 1.5); // 3 eventos * 30min / 60
    assert.equal(res.body.breakdown.length, 1);
    assert.equal(res.body.breakdown[0].quantidade, 3);
  });

  it("200 com zeros quando não há eventos no período", async () => {
    queue("eventos", "await", { data: [], error: null });

    const res = criarResposta();
    await buscarEficiencia(reqBase(), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.total_execucoes, 0);
    assert.equal(res.body.total_horas, 0);
    assert.deepEqual(res.body.breakdown, []);
  });

  it("filtro de período aplica o intervalo de dias correto", async () => {
    queue("eventos", "await", { data: [], error: null });
    const res7 = criarResposta();
    await buscarEficiencia(reqBase({ query: { periodo: "7" } }), res7);
    const [, desde7] = chamadasGte[0];

    queue("eventos", "await", { data: [], error: null });
    const res30 = criarResposta();
    await buscarEficiencia(reqBase({ query: { periodo: "30" } }), res30);
    const [, desde30] = chamadasGte[1];

    assert.ok(new Date(desde7) > new Date(desde30));
  });

  it("usa período padrão de 30 dias quando periodo é inválido ou ausente", async () => {
    queue("eventos", "await", { data: [], error: null });
    const res = criarResposta();
    await buscarEficiencia(reqBase({ query: { periodo: "999" } }), res);

    const [, desdeInvalido] = chamadasGte[0];
    const limiteEsperado = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    assert.ok(Math.abs(new Date(desdeInvalido) - limiteEsperado) < 5000);
  });

  it("400 quando clienteId ausente (perfil admin_efficience sem query)", async () => {
    const req = reqBase({ usuario: { perfil: PERFIS.ADMIN_EFFICIENCE }, query: {} });
    const res = criarResposta();
    await buscarEficiencia(req, res);

    assert.equal(res.statusCode, 400);
  });

  it("500 quando o Supabase retorna erro", async () => {
    queue("eventos", "await", { data: null, error: { message: "falha" } });

    const res = criarResposta();
    await buscarEficiencia(reqBase(), res);

    assert.equal(res.statusCode, 500);
  });
});
