import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import supabase from "../src/config/database.js";
import { buscarClientePorCnpj } from "../src/controllers/clientes.controller.js";

const CLIENTE_ID = "11111111-1111-1111-1111-111111111111";

function criarRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

const filas = new Map();
function chave(tabela, metodo) {
  return `${tabela}:${metodo}`;
}
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
    select() {
      return builder;
    },
    eq() {
      return builder;
    },
    single() {
      return Promise.resolve(consumir("single"));
    },
    maybeSingle() {
      return Promise.resolve(consumir("maybeSingle"));
    },
    then(resolve, reject) {
      return Promise.resolve(consumir("await")).then(resolve, reject);
    },
  };
  return builder;
};

function tokenLicencaValido(clienteId = CLIENTE_ID) {
  queue("licencas", "single", {
    data: {
      cliente_id: clienteId,
      ativa: true,
      validade: "2099-12-31",
    },
    error: null,
  });
}

describe("buscarClientePorCnpj", () => {
  beforeEach(() => {
    filas.clear();
  });

  it("retorna nome quando CNPJ existe (aceita máscara na query)", async () => {
    tokenLicencaValido();
    queue("clientes", "maybeSingle", {
      data: { nome: "Padaria do João" },
      error: null,
    });

    const res = criarRes();
    await buscarClientePorCnpj(
      {
        query: { cnpj: "12.345.678/0001-90" },
        headers: { "x-licenca-token": "token-valido" },
      },
      res,
    );

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { nome: "Padaria do João" });
  });

  it("404 quando CNPJ não está cadastrado", async () => {
    tokenLicencaValido();
    queue("clientes", "maybeSingle", {
      data: null,
      error: null,
    });

    const res = criarRes();
    await buscarClientePorCnpj(
      {
        query: { cnpj: "98.765.432/0001-10" },
        headers: { "x-licenca-token": "token-valido" },
      },
      res,
    );

    assert.equal(res.statusCode, 404);
    assert.equal(res.body.erro, "não encontrado");
  });

  it("400 quando CNPJ tem tamanho inválido", async () => {
    tokenLicencaValido();

    const res = criarRes();
    await buscarClientePorCnpj(
      {
        query: { cnpj: "123" },
        headers: { "x-licenca-token": "token-valido" },
      },
      res,
    );

    assert.equal(res.statusCode, 400);
    assert.match(res.body.erro, /CNPJ inválido/i);
  });

  it("401 quando token de licença é inválido", async () => {
    queue("licencas", "single", { data: null, error: { message: "not found" } });

    const res = criarRes();
    await buscarClientePorCnpj(
      {
        query: { cnpj: "12.345.678/0001-90" },
        headers: { "x-licenca-token": "token-ruim" },
      },
      res,
    );

    assert.equal(res.statusCode, 401);
  });
});
