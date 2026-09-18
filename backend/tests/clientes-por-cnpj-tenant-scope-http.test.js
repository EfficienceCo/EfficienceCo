/**
 * Regressão do #449 na camada HTTP — sobe o app Express real e prova, via
 * fetch, que GET /clientes/por-cnpj é tenant-scoped: o x-licenca-token de um
 * cliente não resolve razão social de outro cliente da plataforma.
 *
 * O mock do Supabase aqui aplica os filtros .eq() de verdade sobre uma
 * tabela em memória (os outros arquivos HTTP usam mock por fila).
 */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import supabase from "../src/config/database.js";
import app from "../src/app.js";

const CLIENTE_A = "11111111-1111-1111-1111-111111111111";
const CLIENTE_B = "22222222-2222-2222-2222-222222222222";

let clientesRows = [];
const licencasPorToken = {
  "token-a": { cliente_id: CLIENTE_A, ativa: true, validade: "2099-12-31" },
  "token-b": { cliente_id: CLIENTE_B, ativa: true, validade: "2099-12-31" },
};

supabase.from = function (tabela) {
  const filtros = {};
  const builder = {
    select() { return builder; },
    eq(coluna, valor) { filtros[coluna] = valor; return builder; },
    order() { return builder; },
    limit() { return builder; },
    single() {
      if (tabela === "licencas") {
        const lic = licencasPorToken[filtros.token];
        return Promise.resolve(
          lic ? { data: lic, error: null } : { data: null, error: { message: "not found" } },
        );
      }
      return Promise.resolve(aplicar());
    },
    maybeSingle() { return Promise.resolve(aplicar()); },
    then(resolve, reject) { return Promise.resolve(aplicar()).then(resolve, reject); },
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

let server;
let baseUrl;

before(
  () =>
    new Promise((resolve) => {
      server = createServer(app);
      server.listen(0, "127.0.0.1", () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    }),
);
after(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => {
  clientesRows = [
    { id: CLIENTE_A, cnpj: "11111111000191", nome: "Cliente A Ltda" },
    { id: CLIENTE_B, cnpj: "22222222000282", nome: "Cliente Teste Dev" },
  ];
});

async function get(path, headers = {}) {
  const res = await fetch(`${baseUrl}${path}`, { headers });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

describe("GET /clientes/por-cnpj — tenant scope na camada HTTP (#449)", () => {
  it("token do Cliente A resolve o CNPJ do Cliente A", async () => {
    const { status, body } = await get(
      "/clientes/por-cnpj?cnpj=11111111000191",
      { "x-licenca-token": "token-a" },
    );
    assert.equal(status, 200);
    assert.equal(body.nome, "Cliente A Ltda");
  });

  it("token do Cliente A NÃO resolve o CNPJ do Cliente B → 404", async () => {
    const { status, body } = await get(
      "/clientes/por-cnpj?cnpj=22222222000282",
      { "x-licenca-token": "token-a" },
    );
    assert.equal(status, 404);
    assert.equal(body.nome, undefined);
    assert.ok(body.erro);
  });

  it("token do Cliente B resolve o CNPJ do Cliente B", async () => {
    const { status, body } = await get(
      "/clientes/por-cnpj?cnpj=22222222000282",
      { "x-licenca-token": "token-b" },
    );
    assert.equal(status, 200);
    assert.equal(body.nome, "Cliente Teste Dev");
  });
});
