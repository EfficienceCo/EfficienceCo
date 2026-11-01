import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import jwt from "jsonwebtoken";
import supabase from "../src/config/database.js";
import app from "../src/app.js";
import { PERFIS } from "../src/config/perfis.js";

const CLIENTE_ID = "11111111-1111-1111-1111-111111111111";
const CONCILIACAO_ID = "22222222-2222-4222-8222-222222222222";
const JWT_SECRET = "conciliacoes-ids-invalidos-test-secret";

process.env.JWT_SECRET ??= JWT_SECRET;

const originalFrom = supabase.from;
supabase.from = function consultaNaoEsperada() {
  throw new Error("IDs inválidos não devem gerar consultas ao Supabase");
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

after(async () => {
  supabase.from = originalFrom;
  await new Promise((resolve) => server.close(resolve));
});

function tokenValido() {
  return jwt.sign(
    {
      id: "usuario-teste",
      perfil: PERFIS.ADMIN_CLIENTE,
      cliente_id: CLIENTE_ID,
    },
    process.env.JWT_SECRET,
  );
}

async function requisitar(path, { method = "GET", body } = {}) {
  const headers = { authorization: `Bearer ${tokenValido()}` };
  if (body !== undefined) headers["content-type"] = "application/json";

  const resposta = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  return {
    status: resposta.status,
    body: await resposta.json(),
  };
}

const casos = [
  { nome: "busca de conciliação", path: "/conciliacoes/nao-e-uuid" },
  { nome: "download do relatório", path: "/conciliacoes/nao-e-uuid/relatorio" },
  { nome: "conclusão da conciliação", method: "POST", path: "/conciliacoes/nao-e-uuid/concluir" },
  {
    nome: "confirmação de par",
    method: "PATCH",
    path: `/conciliacoes/${CONCILIACAO_ID}/pares/x/confirmar`,
  },
  { nome: "listagem de transações", path: "/conciliacoes/extrato/x/transacoes" },
  {
    nome: "criação da conciliação",
    method: "POST",
    path: "/conciliacoes",
    body: { extrato_id: "abc", mes: 9, ano: 2026 },
  },
];

describe("Conciliações — IDs inválidos", () => {
  for (const caso of casos) {
    it(`400 para ${caso.nome} sem consultar o banco`, async () => {
      const resposta = await requisitar(caso.path, caso);

      assert.equal(resposta.status, 400);
      assert.match(resposta.body.erro, /UUID válido/i);
    });
  }
});

// PRB-C-27 / BUG-CONC-21 (#698). Mesmo título do skip da TEST-7.
describe("Conciliações — upload acima do limite", () => {
  it("413 em português citando 10 MB para OFX de 10 MB + 1 byte, sem consultar o banco (PRB-C-27, #698)", async () => {
    const form = new FormData();
    form.append("arquivo", new Blob([Buffer.alloc(10 * 1024 * 1024 + 1, "A")]), "grande.ofx");

    const resposta = await fetch(`${baseUrl}/conciliacoes/extrato`, {
      method: "POST",
      headers: { authorization: `Bearer ${tokenValido()}` },
      body: form,
    });
    const body = await resposta.json();

    assert.equal(resposta.status, 413);
    assert.match(body.erro, /10 ?MB/i);
    assert.doesNotMatch(body.erro, /too large/i);
  });
});
