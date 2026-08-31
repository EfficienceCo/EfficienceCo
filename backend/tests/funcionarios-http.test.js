/**
 * Testes HTTP dos cinco endpoints de funcionários.
 *
 * Exercitam o app Express real, incluindo autenticação JWT e RBAC das rotas;
 * o Supabase é mockado porque persistência já é coberta em funcionarios.test.js.
 */
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import jwt from "jsonwebtoken";
import supabase from "../src/config/database.js";
import app from "../src/app.js";
import { PERFIS } from "../src/config/perfis.js";

const CLIENTE_ID = "11111111-1111-1111-1111-111111111111";
const CLIENTE_ID_OUTRO = "22222222-2222-2222-2222-222222222222";
const FUNCIONARIO_ID = "33333333-3333-3333-3333-333333333333";
const JWT_SECRET = "funcionarios-http-test-secret";

process.env.JWT_SECRET ??= JWT_SECRET;

// ---------------------------------------------------------------------------
// Mock de Supabase
// ---------------------------------------------------------------------------

const originalFrom = supabase.from;
const filas = new Map();

function chave(tabela, metodo) {
  return `${tabela}:${metodo}`;
}

function queue(tabela, metodo, resultado) {
  const key = chave(tabela, metodo);
  if (!filas.has(key)) filas.set(key, []);
  filas.get(key).push(resultado);
}

supabase.from = function (tabela) {
  const consumir = (metodo, fallback) => {
    const fila = filas.get(chave(tabela, metodo));
    if (!fila || fila.length === 0) return fallback;
    return fila.shift();
  };

  const builder = {
    select() { return builder; },
    insert() { return builder; },
    update() { return builder; },
    eq() { return builder; },
    order() { return builder; },
    maybeSingle() {
      return Promise.resolve(consumir("maybeSingle", { data: null, error: null }));
    },
    single() {
      return Promise.resolve(consumir("single", { data: null, error: null }));
    },
    then(resolve, reject) {
      return Promise.resolve(consumir("await", { data: [], error: null })).then(resolve, reject);
    },
  };

  return builder;
};

// ---------------------------------------------------------------------------
// Servidor HTTP efêmero e helpers
// ---------------------------------------------------------------------------

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

after(async () => {
  supabase.from = originalFrom;
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => filas.clear());

function token(perfil, clienteId = CLIENTE_ID) {
  return jwt.sign(
    { id: "usuario-teste", email: "teste@efficience.co", perfil, cliente_id: clienteId },
    process.env.JWT_SECRET,
  );
}

function funcionarioPayload() {
  return {
    cpf: "123.456.789-09",
    nome: "Maria da Silva",
    data_admissao: "2026-08-01",
    categoria: "101",
    salario: 3500.5,
  };
}

async function requisitar(path, { method = "GET", body, jwtToken } = {}) {
  const headers = {};
  if (jwtToken) headers.authorization = `Bearer ${jwtToken}`;
  if (body !== undefined) headers["content-type"] = "application/json";

  const resposta = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  return {
    status: resposta.status,
    body: await resposta.json().catch(() => null),
  };
}

// ---------------------------------------------------------------------------
// Contrato HTTP
// ---------------------------------------------------------------------------

describe("/funcionarios — camada HTTP", () => {
  it("POST /funcionarios cria vínculo para admin do cliente", async () => {
    queue("funcionarios", "maybeSingle", {
      data: { id: FUNCIONARIO_ID, cliente_id: CLIENTE_ID, ...funcionarioPayload() },
      error: null,
    });

    const resposta = await requisitar("/funcionarios", {
      method: "POST",
      body: funcionarioPayload(),
      jwtToken: token(PERFIS.ADMIN_CLIENTE),
    });

    assert.equal(resposta.status, 201);
    assert.equal(resposta.body.id, FUNCIONARIO_ID);
  });

  it("GET /funcionarios?clienteId= lista o cliente solicitado pelo admin da Efficience", async () => {
    queue("funcionarios", "await", {
      data: [{ id: FUNCIONARIO_ID, cliente_id: CLIENTE_ID_OUTRO, nome: "Maria da Silva" }],
      error: null,
    });

    const resposta = await requisitar(`/funcionarios?clienteId=${CLIENTE_ID_OUTRO}`, {
      jwtToken: token(PERFIS.ADMIN_EFFICIENCE, undefined),
    });

    assert.equal(resposta.status, 200);
    assert.equal(resposta.body[0].cliente_id, CLIENTE_ID_OUTRO);
  });

  it("GET /funcionarios/:id devolve 404 para funcionário de outro cliente", async () => {
    queue("funcionarios", "maybeSingle", {
      data: { id: FUNCIONARIO_ID, cliente_id: CLIENTE_ID_OUTRO },
      error: null,
    });

    const resposta = await requisitar(`/funcionarios/${FUNCIONARIO_ID}`, {
      jwtToken: token(PERFIS.FUNCIONARIO),
    });

    assert.equal(resposta.status, 404);
    assert.match(resposta.body.erro, /não encontrado/i);
  });

  it("PATCH /funcionarios/:id altera o endereço para admin do cliente", async () => {
    const endereco = { tipoLogradouro: "Rua", logradouro: "das Flores", numero: "120", uf: "SP" };
    queue("funcionarios", "maybeSingle", { data: { cliente_id: CLIENTE_ID }, error: null });
    queue("funcionarios", "maybeSingle", {
      data: { id: FUNCIONARIO_ID, cliente_id: CLIENTE_ID, endereco },
      error: null,
    });

    const resposta = await requisitar(`/funcionarios/${FUNCIONARIO_ID}`, {
      method: "PATCH",
      body: { endereco },
      jwtToken: token(PERFIS.ADMIN_CLIENTE),
    });

    assert.equal(resposta.status, 200);
    assert.deepEqual(resposta.body.endereco, endereco);
  });

  it("PATCH /funcionarios/:id/desligar registra o desligamento para admin do cliente", async () => {
    queue("funcionarios", "maybeSingle", {
      data: { cliente_id: CLIENTE_ID, data_desligamento: null },
      error: null,
    });
    queue("funcionarios", "maybeSingle", {
      data: { id: FUNCIONARIO_ID, cliente_id: CLIENTE_ID, data_desligamento: "2026-12-31" },
      error: null,
    });

    const resposta = await requisitar(`/funcionarios/${FUNCIONARIO_ID}/desligar`, {
      method: "PATCH",
      body: { data_desligamento: "2026-12-31" },
      jwtToken: token(PERFIS.ADMIN_CLIENTE),
    });

    assert.equal(resposta.status, 200);
    assert.equal(resposta.body.data_desligamento, "2026-12-31");
  });

  it("retorna 401 sem JWT e 403 quando funcionário tenta alterar vínculo", async () => {
    const semToken = await requisitar("/funcionarios");
    assert.equal(semToken.status, 401);

    const semPermissao = await requisitar("/funcionarios", {
      method: "POST",
      body: funcionarioPayload(),
      jwtToken: token(PERFIS.FUNCIONARIO),
    });
    assert.equal(semPermissao.status, 403);
  });
});
