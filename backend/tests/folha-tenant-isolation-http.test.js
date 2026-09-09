/**
 * Cobertura HTTP real do isolamento multi-tenant nos quatro handlers de folha (#441).
 *
 * Sobe o app Express real (autenticação JWT + RBAC + licença) e faz fetch contra um
 * servidor efêmero. Antes da correção, consultar / calcular / gerar-saída / baixar um
 * processamento de OUTRO cliente_id respondia 403 — o que confirmava a existência do
 * UUID (enumeração). O contrato agora é 404 "não encontrado", indistinguível de um
 * processamento inexistente.
 *
 * O Supabase é mockado (mesmo singleton) — persistência já é coberta em
 * folha-status.test.js / folha-pipeline.test.js. O mock NÃO filtra por cliente_id;
 * isso é proposital: os cenários abaixo cobrem tanto o caso em que a própria query
 * já exclui a linha (mock devolve null) quanto o caso em que a linha chega ao handler
 * e a checagem de dono (defesa em profundidade) precisa barrar com 404.
 */
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import jwt from "jsonwebtoken";
import supabase from "../src/config/database.js";
import app from "../src/app.js";
import { PERFIS } from "../src/config/perfis.js";

const CLIENTE_A = "11111111-1111-1111-1111-111111111111";
const CLIENTE_B = "22222222-2222-2222-2222-222222222222";
const PROC_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

process.env.JWT_SECRET ??= "folha-tenant-isolation-test-secret";

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
    in() { return builder; },
    order() { return builder; },
    limit() { return builder; },
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

function token(perfil, clienteId = CLIENTE_A) {
  return jwt.sign(
    { id: "usuario-teste", email: "teste@efficience.co", perfil, cliente_id: clienteId },
    process.env.JWT_SECRET,
  );
}

// Licença ativa pro cliente do JWT — exigirLicencaAtiva roda antes de todo handler.
function licencaAtiva() {
  queue("licencas", "maybeSingle", {
    data: { ativa: true, validade: "2099-12-31" },
    error: null,
  });
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

// Os quatro endpoints citados no #441, na forma [rótulo, método, path].
const ENDPOINTS = [
  ["status", "GET", `/folha/${PROC_ID}`],
  ["calcular", "POST", `/folha/${PROC_ID}/calcular`],
  ["gerar-saída", "POST", `/folha/${PROC_ID}/gerar-saida`],
  ["download", "GET", `/folha/${PROC_ID}/download/holerite_a.pdf`],
];

// ---------------------------------------------------------------------------
// Contrato HTTP — cross-tenant
// ---------------------------------------------------------------------------

describe("folha — isolamento multi-tenant (camada HTTP, #441)", () => {
  for (const [rotulo, metodo, path] of ENDPOINTS) {
    it(`${rotulo}: 404 (não 403) quando a query de tenant já exclui a linha`, async () => {
      licencaAtiva();
      // Query com .eq("cliente_id", CLIENTE_A) não encontra o processamento do CLIENTE_B.
      queue("processamentos_folha", "maybeSingle", { data: null, error: null });

      const resposta = await requisitar(path, {
        method: metodo,
        jwtToken: token(PERFIS.ADMIN_CLIENTE, CLIENTE_A),
      });

      assert.equal(resposta.status, 404);
      assert.match(resposta.body.erro, /não encontrado/i);
    });

    it(`${rotulo}: 404 (não 403) mesmo se a linha de outro tenant chegar ao handler`, async () => {
      licencaAtiva();
      // Defesa em profundidade: se o filtro falhar, a checagem de dono ainda barra.
      queue("processamentos_folha", "maybeSingle", {
        data: {
          id: PROC_ID,
          cliente_id: CLIENTE_B,
          status: "concluido",
          mes_referencia: "2026-07-01",
          motivo_erro: null,
          arquivo_origem_path: "clientes/b/x.xlsx",
        },
        error: null,
      });

      const resposta = await requisitar(path, {
        method: metodo,
        jwtToken: token(PERFIS.ADMIN_CLIENTE, CLIENTE_A),
      });

      assert.equal(resposta.status, 404);
      assert.notEqual(resposta.status, 403);
      assert.match(resposta.body.erro, /não encontrado/i);
    });
  }

  it("status: 200 no processamento do próprio cliente (o filtro não bloqueia o dono)", async () => {
    licencaAtiva();
    queue("processamentos_folha", "maybeSingle", {
      data: {
        id: PROC_ID,
        cliente_id: CLIENTE_A,
        status: "concluido",
        mes_referencia: "2026-07-01",
        motivo_erro: null,
      },
      error: null,
    });
    queue("folha_calculos", "await", { data: [], error: null });
    queue("folha_relatorios", "await", { data: [], error: null });

    const resposta = await requisitar(`/folha/${PROC_ID}`, {
      jwtToken: token(PERFIS.ADMIN_CLIENTE, CLIENTE_A),
    });

    assert.equal(resposta.status, 200);
    assert.equal(resposta.body.processamento_id, PROC_ID);
  });

  it("status: admin_efficience continua enxergando processamento de qualquer cliente", async () => {
    // admin_efficience pula exigirLicencaAtiva e o filtro de tenant.
    queue("processamentos_folha", "maybeSingle", {
      data: {
        id: PROC_ID,
        cliente_id: CLIENTE_B,
        status: "concluido",
        mes_referencia: "2026-07-01",
        motivo_erro: null,
      },
      error: null,
    });
    queue("folha_calculos", "await", { data: [], error: null });
    queue("folha_relatorios", "await", { data: [], error: null });

    const resposta = await requisitar(`/folha/${PROC_ID}`, {
      jwtToken: token(PERFIS.ADMIN_EFFICIENCE, undefined),
    });

    assert.equal(resposta.status, 200);
    assert.equal(resposta.body.processamento_id, PROC_ID);
  });
});
