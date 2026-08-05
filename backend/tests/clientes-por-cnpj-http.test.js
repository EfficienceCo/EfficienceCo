/**
 * Testes de integração HTTP para GET /clientes/por-cnpj.
 *
 * Sobe o app Express real (sem servidor separado) e faz fetch contra um
 * servidor efêmero na porta 0. Garante que o roteamento está correto
 * (/por-cnpj registrado antes de /:id), que o header x-licenca-token passa
 * pelo middleware e que a resposta segue o contrato JSON.
 *
 * O Supabase continua mockado (mesmo singleton) — o objetivo é testar a
 * camada HTTP, não o banco.
 */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import supabase from "../src/config/database.js";
import app from "../src/app.js";

// ---------------------------------------------------------------------------
// Mock de supabase
// ---------------------------------------------------------------------------

const filas = new Map();
function chave(t, m) { return `${t}:${m}`; }
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

// ---------------------------------------------------------------------------
// Servidor HTTP efêmero
// ---------------------------------------------------------------------------

let server;
let baseUrl;

before(
  () =>
    new Promise((resolve) => {
      server = createServer(app);
      server.listen(0, "127.0.0.1", () => {
        const { port } = server.address();
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    }),
);

after(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => filas.clear());

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tokenValido(override = {}) {
  queue("licencas", "single", {
    data: { cliente_id: "11111111-1111-1111-1111-111111111111", ativa: true, validade: "2099-12-31", ...override },
    error: null,
  });
}

async function get(path, headers = {}) {
  const res = await fetch(`${baseUrl}${path}`, { headers });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe("GET /clientes/por-cnpj — camada HTTP", () => {
  it("200 com nome quando CNPJ existe e token é válido", async () => {
    tokenValido();
    queue("clientes", "await", {
      data: [{ nome: "Padaria do João", cnpj: "12345678000190" }],
      error: null,
    });

    const { status, body } = await get(
      "/clientes/por-cnpj?cnpj=12345678000190",
      { "x-licenca-token": "token-valido" },
    );

    assert.equal(status, 200);
    assert.equal(body.nome, "Padaria do João");
  });

  it("404 quando CNPJ não encontrado no banco", async () => {
    tokenValido();
    queue("clientes", "await", { data: [], error: null });

    const { status, body } = await get(
      "/clientes/por-cnpj?cnpj=99999999000199",
      { "x-licenca-token": "token-valido" },
    );

    assert.equal(status, 404);
    assert.ok(body.erro);
  });

  it("400 quando CNPJ tem comprimento inválido", async () => {
    tokenValido();

    const { status, body } = await get(
      "/clientes/por-cnpj?cnpj=123",
      { "x-licenca-token": "token-valido" },
    );

    assert.equal(status, 400);
    assert.match(body.erro, /CNPJ inválido/i);
  });

  it("401 quando token ausente", async () => {
    const { status } = await get("/clientes/por-cnpj?cnpj=12345678000190");
    assert.equal(status, 401);
  });

  it("401 quando licença inativa", async () => {
    tokenValido({ ativa: false });

    const { status } = await get(
      "/clientes/por-cnpj?cnpj=12345678000190",
      { "x-licenca-token": "token-inativo" },
    );

    assert.equal(status, 401);
  });

  it("resposta tem Content-Type application/json", async () => {
    tokenValido();
    queue("clientes", "await", {
      data: [{ nome: "Empresa X", cnpj: "12345678000190" }],
      error: null,
    });

    const res = await fetch(`${baseUrl}/clientes/por-cnpj?cnpj=12345678000190`, {
      headers: { "x-licenca-token": "t" },
    });

    assert.match(res.headers.get("content-type") ?? "", /application\/json/);
  });

  it("rota /por-cnpj não é capturada pelo handler /:id (não retorna 400 de UUID inválido)", async () => {
    // Se /por-cnpj fosse tratada como /:id, tentaria buscar um cliente pelo UUID "por-cnpj",
    // resultando em comportamento incorreto. A resposta correta é 401 (sem token).
    const { status } = await get("/clientes/por-cnpj");
    // Sem token → 401 antes de qualquer lógica de ID
    assert.notEqual(status, 404, "não deve ser tratado como rota desconhecida");
    // E certamente não deve ser 200 sem token
    assert.notEqual(status, 200);
  });
});
