/**
 * Regressão do #449 — GET /clientes/por-cnpj precisa ser tenant-scoped.
 *
 * O token de licença resolve APENAS o CNPJ do cliente vinculado a ele.
 * CNPJ de qualquer outro cliente da plataforma cai no mesmo 404 de
 * "não cadastrado" — um licenciado não consegue enumerar razão social
 * por CNPJ fora do seu escopo (LGPD).
 *
 * Diferente dos outros arquivos deste endpoint, o mock aqui aplica de
 * verdade os filtros .eq() sobre uma tabela em memória, pra exercitar o
 * escopo por `id` que a correção adiciona à query.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import supabase from "../src/config/database.js";
import { buscarClientePorCnpj } from "../src/controllers/clientes.controller.js";

const CLIENTE_A = "11111111-1111-1111-1111-111111111111";
const CLIENTE_B = "22222222-2222-2222-2222-222222222222";

// Tabela `clientes` em memória — o mock filtra por .eq() de verdade.
let clientesRows = [];
// Linha de `licencas` que o próximo validarTokenLicenca vai enxergar.
let licencaRow = null;

supabase.from = function (tabela) {
  const filtros = {};
  const builder = {
    select() { return builder; },
    eq(coluna, valor) { filtros[coluna] = valor; return builder; },
    order() { return builder; },
    limit() { return builder; },
    single() {
      if (tabela === "licencas") {
        return Promise.resolve(
          licencaRow
            ? { data: licencaRow, error: null }
            : { data: null, error: { message: "not found" } },
        );
      }
      return Promise.resolve(aplicar());
    },
    maybeSingle() { return Promise.resolve(aplicar()); },
    then(resolve, reject) {
      return Promise.resolve(aplicar()).then(resolve, reject);
    },
  };

  function aplicar() {
    if (tabela !== "clientes") return { data: null, error: null };
    const match = clientesRows.find((row) =>
      Object.entries(filtros).every(([col, val]) => row[col] === val),
    );
    return { data: match ? { nome: match.nome } : null, error: null };
  }

  return builder;
};

function criarRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

function licencaDoCliente(clienteId) {
  licencaRow = { cliente_id: clienteId, ativa: true, validade: "2099-12-31" };
}

describe("GET /clientes/por-cnpj — escopo por licença (#449)", () => {
  beforeEach(() => {
    licencaRow = null;
    clientesRows = [
      { id: CLIENTE_A, cnpj: "11111111000191", nome: "Cliente A Ltda" },
      { id: CLIENTE_B, cnpj: "22222222000282", nome: "Cliente Teste Dev" },
    ];
  });

  it("resolve o CNPJ do próprio cliente da licença", async () => {
    licencaDoCliente(CLIENTE_A);

    const res = criarRes();
    await buscarClientePorCnpj(
      {
        query: { cnpj: "11.111.111/0001-91" },
        headers: { "x-licenca-token": "token-a" },
      },
      res,
    );

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { nome: "Cliente A Ltda" });
  });

  it("404 quando o CNPJ pertence a outro cliente da plataforma", async () => {
    licencaDoCliente(CLIENTE_A);

    const res = criarRes();
    await buscarClientePorCnpj(
      {
        query: { cnpj: "22.222.222/0002-82" }, // CNPJ do Cliente B
        headers: { "x-licenca-token": "token-a" },
      },
      res,
    );

    assert.equal(res.statusCode, 404);
    assert.equal(res.body.erro, "não encontrado");
    // não vaza a razão social do outro cliente
    assert.equal(res.body.nome, undefined);
  });

  it("404 idêntico para CNPJ fora do escopo e CNPJ inexistente", async () => {
    licencaDoCliente(CLIENTE_A);

    const resForaEscopo = criarRes();
    await buscarClientePorCnpj(
      { query: { cnpj: "22222222000282" }, headers: { "x-licenca-token": "t" } },
      resForaEscopo,
    );

    licencaDoCliente(CLIENTE_A);
    const resInexistente = criarRes();
    await buscarClientePorCnpj(
      { query: { cnpj: "99999999000199" }, headers: { "x-licenca-token": "t" } },
      resInexistente,
    );

    assert.equal(resForaEscopo.statusCode, resInexistente.statusCode);
    assert.deepEqual(resForaEscopo.body, resInexistente.body);
  });

  it("cada licença enxerga só o seu cliente", async () => {
    licencaDoCliente(CLIENTE_B);

    const res = criarRes();
    await buscarClientePorCnpj(
      {
        query: { cnpj: "22222222000282" },
        headers: { "x-licenca-token": "token-b" },
      },
      res,
    );

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { nome: "Cliente Teste Dev" });
  });
});
