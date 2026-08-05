/**
 * Casos de borda adicionais para buscarClientePorCnpj:
 * licença inativa/expirada, erro de DB, CNPJ sem máscara no banco,
 * inputs extremos (undefined, string vazia, comprimento errado).
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import supabase from "../src/config/database.js";
import { buscarClientePorCnpj } from "../src/controllers/clientes.controller.js";

// ---------------------------------------------------------------------------
// Mock de supabase (mesmo padrão do arquivo principal)
// ---------------------------------------------------------------------------

const filas = new Map();
function chave(tabela, metodo) { return `${tabela}:${metodo}`; }
function queue(tabela, metodo, resultado) {
  const k = chave(tabela, metodo);
  if (!filas.has(k)) filas.set(k, []);
  filas.get(k).push(resultado);
}

supabase.from = function (tabela) {
  const consumir = (metodo, fallback = { data: null, error: null }) => {
    const k = chave(tabela, metodo);
    const fila = filas.get(k);
    if (!fila || fila.length === 0) return fallback;
    return fila.shift();
  };
  const builder = {
    select() { return builder; },
    eq()     { return builder; },
    order()  { return builder; },
    limit()  { return builder; },
    maybeSingle() { return Promise.resolve(consumir("maybeSingle")); },
    single()      { return Promise.resolve(consumir("single")); },
    then(resolve, reject) {
      return Promise.resolve(consumir("await")).then(resolve, reject);
    },
  };
  return builder;
};

function criarRes() {
  return {
    statusCode: 200,
    body: null,
    status(code)  { this.statusCode = code; return this; },
    json(payload) { this.body = payload;    return this; },
  };
}

const CLIENTE_ID = "11111111-1111-1111-1111-111111111111";

function tokenValido(override = {}) {
  queue("licencas", "single", {
    data: { cliente_id: CLIENTE_ID, ativa: true, validade: "2099-12-31", ...override },
    error: null,
  });
}

describe("buscarClientePorCnpj — casos de borda", () => {
  beforeEach(() => filas.clear());

  // ---- normalização de CNPJ no banco -------------------------------------

  it("CNPJ armazenado sem máscara no banco é encontrado com input mascarado", async () => {
    tokenValido();
    queue("clientes", "await", {
      data: [{ nome: "Mercado Central", cnpj: "98765432000110" }],
      error: null,
    });

    const res = criarRes();
    await buscarClientePorCnpj(
      { query: { cnpj: "98.765.432/0001-10" }, headers: { "x-licenca-token": "t" } },
      res,
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.nome, "Mercado Central");
  });

  it("CNPJ armazenado com máscara parcial (pontos, sem barra/hífen) é encontrado", async () => {
    tokenValido();
    queue("clientes", "await", {
      data: [{ nome: "Loja ABC", cnpj: "12.345.678/000190" }],
      error: null,
    });

    const res = criarRes();
    await buscarClientePorCnpj(
      { query: { cnpj: "12345678000190" }, headers: { "x-licenca-token": "t" } },
      res,
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.nome, "Loja ABC");
  });

  it("banco com múltiplos clientes — retorna o correto", async () => {
    tokenValido();
    queue("clientes", "await", {
      data: [
        { nome: "Empresa A", cnpj: "11.111.111/0001-11" },
        { nome: "Empresa B", cnpj: "22.222.222/0002-22" },
        { nome: "Empresa C", cnpj: "33333333000333" },
      ],
      error: null,
    });

    const res = criarRes();
    await buscarClientePorCnpj(
      { query: { cnpj: "22222222000222" }, headers: { "x-licenca-token": "t" } },
      res,
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.nome, "Empresa B");
  });

  // ---- validação do token ------------------------------------------------

  it("licença inativa → 401", async () => {
    tokenValido({ ativa: false });

    const res = criarRes();
    await buscarClientePorCnpj(
      { query: { cnpj: "12345678000190" }, headers: { "x-licenca-token": "t" } },
      res,
    );

    assert.equal(res.statusCode, 401);
  });

  it("licença expirada → 401", async () => {
    tokenValido({ validade: "2000-01-01" });

    const res = criarRes();
    await buscarClientePorCnpj(
      { query: { cnpj: "12345678000190" }, headers: { "x-licenca-token": "t" } },
      res,
    );

    assert.equal(res.statusCode, 401);
  });

  it("header x-licenca-token ausente → 401", async () => {
    // validarTokenLicenca retorna null imediatamente se token for falsy
    const res = criarRes();
    await buscarClientePorCnpj(
      { query: { cnpj: "12345678000190" }, headers: {} },
      res,
    );

    assert.equal(res.statusCode, 401);
  });

  // ---- validação do CNPJ -------------------------------------------------

  it("cnpj ausente na query string → 400", async () => {
    tokenValido();

    const res = criarRes();
    await buscarClientePorCnpj(
      { query: {}, headers: { "x-licenca-token": "t" } },
      res,
    );

    assert.equal(res.statusCode, 400);
    assert.match(res.body.erro, /CNPJ inválido/i);
  });

  it("cnpj string vazia → 400", async () => {
    tokenValido();

    const res = criarRes();
    await buscarClientePorCnpj(
      { query: { cnpj: "" }, headers: { "x-licenca-token": "t" } },
      res,
    );

    assert.equal(res.statusCode, 400);
  });

  it("cnpj com 13 dígitos → 400 (faltando um dígito)", async () => {
    tokenValido();

    const res = criarRes();
    await buscarClientePorCnpj(
      { query: { cnpj: "1234567800019" }, headers: { "x-licenca-token": "t" } },
      res,
    );

    assert.equal(res.statusCode, 400);
  });

  it("cnpj com 15 dígitos → 400 (dígito a mais)", async () => {
    tokenValido();

    const res = criarRes();
    await buscarClientePorCnpj(
      { query: { cnpj: "123456780001900" }, headers: { "x-licenca-token": "t" } },
      res,
    );

    assert.equal(res.statusCode, 400);
  });

  it("cnpj com apenas letras e caracteres → 400", async () => {
    tokenValido();

    const res = criarRes();
    await buscarClientePorCnpj(
      { query: { cnpj: "abc/def-gh" }, headers: { "x-licenca-token": "t" } },
      res,
    );

    assert.equal(res.statusCode, 400);
  });

  // ---- erros de banco ----------------------------------------------------

  it("erro do Supabase na consulta de clientes → 500", async () => {
    tokenValido();
    queue("clientes", "await", {
      data: null,
      error: { message: "connection timeout" },
    });

    const res = criarRes();
    await buscarClientePorCnpj(
      { query: { cnpj: "12345678000190" }, headers: { "x-licenca-token": "t" } },
      res,
    );

    assert.equal(res.statusCode, 500);
    assert.ok("erro" in res.body);
  });

  it("banco retorna data: null sem erro → 404", async () => {
    tokenValido();
    queue("clientes", "await", { data: null, error: null });

    const res = criarRes();
    await buscarClientePorCnpj(
      { query: { cnpj: "12345678000190" }, headers: { "x-licenca-token": "t" } },
      res,
    );

    assert.equal(res.statusCode, 404);
  });

  it("banco retorna lista vazia → 404", async () => {
    tokenValido();
    queue("clientes", "await", { data: [], error: null });

    const res = criarRes();
    await buscarClientePorCnpj(
      { query: { cnpj: "12345678000190" }, headers: { "x-licenca-token": "t" } },
      res,
    );

    assert.equal(res.statusCode, 404);
  });
});
