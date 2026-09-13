import { describe, it, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import supabase from "../src/config/database.js";
import { atualizarCliente } from "../src/controllers/clientes.controller.js";

const CLIENTE_ID = "11111111-1111-1111-1111-111111111111";

// ---------------------------------------------------------------------------
// Mock de supabase — filas por `tabela:metodo`, consumidas em FIFO.
// Mesmo padrão de tests/eventos-esocial.test.js.
// ---------------------------------------------------------------------------
const originalFrom = supabase.from;
const filas = new Map();
const chave = (t, m) => `${t}:${m}`;
function queue(tabela, metodo, resultado) {
  const k = chave(tabela, metodo);
  if (!filas.has(k)) filas.set(k, []);
  filas.get(k).push(resultado);
}

supabase.from = function (tabela) {
  const consumir = (metodo, fallback) => {
    const fila = filas.get(chave(tabela, metodo));
    if (!fila || fila.length === 0) return fallback;
    return fila.shift();
  };
  const builder = {
    select() { return builder; },
    update() { return builder; },
    eq() { return builder; },
    single() { return Promise.resolve(consumir("single", { data: null, error: null })); },
  };
  return builder;
};

after(() => { supabase.from = originalFrom; });
beforeEach(() => filas.clear());

function criarResposta() {
  return {
    statusCode: null,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(p) { this.body = p; return this; },
  };
}

// ---------------------------------------------------------------------------
// PATCH /clientes/:id — esocial_configurado
// Cobre o bug #436-ES: 1º evento eSocial bloqueado sem forma de ligar a flag
// pela API (só dava pra ligar via UPDATE SQL na mão).
// ---------------------------------------------------------------------------
describe("atualizarCliente — esocial_configurado", () => {
  it("liga a flag quando esocial_configurado: true vem no body", async () => {
    queue("clientes", "single", { data: { id: CLIENTE_ID }, error: null });
    queue("clientes", "single", {
      data: { id: CLIENTE_ID, esocial_configurado: true },
      error: null,
    });

    const req = { params: { id: CLIENTE_ID }, body: { esocial_configurado: true } };
    const res = criarResposta();
    await atualizarCliente(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.esocial_configurado, true);
  });

  it("400 quando esocial_configurado não é boolean", async () => {
    queue("clientes", "single", { data: { id: CLIENTE_ID }, error: null });

    const req = { params: { id: CLIENTE_ID }, body: { esocial_configurado: "true" } };
    const res = criarResposta();
    await atualizarCliente(req, res);

    assert.equal(res.statusCode, 400);
  });

  it("404 quando o cliente não existe", async () => {
    queue("clientes", "single", { data: null, error: { message: "not found" } });

    const req = { params: { id: CLIENTE_ID }, body: { esocial_configurado: true } };
    const res = criarResposta();
    await atualizarCliente(req, res);

    assert.equal(res.statusCode, 404);
  });
});
