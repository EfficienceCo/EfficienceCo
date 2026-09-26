/**
 * BUG-NFE-11 / #571 — JSON malformado não pode virar HTML com stack/path.
 * O parser roda antes das rotas, então o contrato vale para qualquer path.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import express from "express";
import app from "../src/app.js";
import { tratarErro } from "../src/middlewares/erro.middleware.js";

const CORPO_QUEBRADO = "{json quebrado";
const VAZAMENTO = /<html|stack|node_modules|body-parser|at parse|[A-Za-z]:\\|\/Users\/|\/home\//i;

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

async function postJsonQuebrado(caminho) {
  const resposta = await fetch(`${baseUrl}${caminho}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: CORPO_QUEBRADO,
  });
  const texto = await resposta.text();
  return { status: resposta.status, tipo: resposta.headers.get("content-type") || "", texto };
}

function assertJsonLimpo({ status, tipo, texto }, caminho) {
  assert.equal(status, 400, caminho);
  assert.match(tipo, /application\/json/);
  assert.doesNotMatch(texto, VAZAMENTO);
  const corpo = JSON.parse(texto);
  assert.deepEqual(Object.keys(corpo), ["erro"]);
  assert.equal(corpo.erro, "JSON malformado");
}

describe("JSON malformado", () => {
  const ambientes = ["development", "production"];
  const rotas = ["/lancamentos-fiscais", "/auth/login", "/clientes"];

  for (const ambiente of ambientes) {
    for (const rota of rotas) {
      it(`400 JSON sem stack nem path em ${rota} (${ambiente})`, async () => {
        const anterior = process.env.NODE_ENV;
        process.env.NODE_ENV = ambiente;
        try {
          assertJsonLimpo(await postJsonQuebrado(rota), rota);
        } finally {
          if (anterior === undefined) delete process.env.NODE_ENV;
          else process.env.NODE_ENV = anterior;
        }
      });
    }
  }

  it("erro 500 não devolve a mensagem nem o stack", async () => {
    const mini = express();
    mini.get("/quebra", () => {
      const falha = new Error("detalhe em C:\\Users\\joao\\backend\\src\\server.js");
      falha.stack = "Error: detalhe\n    at parse (C:\\Users\\joao\\backend\\node_modules\\body-parser\\lib\\types\\json.js:1:1)";
      throw falha;
    });
    mini.use(tratarErro);

    const http = createServer(mini);
    await new Promise((resolve) => http.listen(0, "127.0.0.1", resolve));
    try {
      const porta = http.address().port;
      const resposta = await fetch(`http://127.0.0.1:${porta}/quebra`);
      const texto = await resposta.text();
      assert.equal(resposta.status, 500);
      assert.match(resposta.headers.get("content-type") || "", /application\/json/);
      assert.doesNotMatch(texto, VAZAMENTO);
      assert.deepEqual(JSON.parse(texto), { erro: "Erro interno" });
    } finally {
      await new Promise((resolve) => http.close(resolve));
    }
  });
});
