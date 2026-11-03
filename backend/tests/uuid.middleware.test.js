/**
 * TEST-6 (#683): validarUuidParams (src/middlewares/uuid.middleware.js).
 * O que importa: id fora do formato vira 400 aqui, em vez de 22P02 no Postgres e 500 no handler.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { validarUuidParams } from "../src/middlewares/uuid.middleware.js";
import { responderOk, subirMiniApp } from "./helpers/mini-app.js";

// Com letras a-f de propósito: um UUID só de dígitos não distingue maiúscula de minúscula
// nem prova que a classe [0-9a-f] aceita letras.
const UUID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("validarUuidParams", () => {
  let app;
  before(async () => {
    app = await subirMiniApp(servidor => {
      servidor.get("/um/:id", validarUuidParams("id"), responderOk);
      servidor.get("/dois/:id/pares/:pareId", validarUuidParams("id", "pareId"), responderOk);
      servidor.get("/sem-param", validarUuidParams("id"), responderOk);
      servidor.get("/nenhum/:id", validarUuidParams(), responderOk);
    });
  });
  after(() => app.fechar());

  it("UUID válido: passa", async () => {
    assert.equal((await app.requisitar(`/um/${UUID}`)).status, 200);
  });

  it("UUID em maiúscula: passa (o Postgres aceita as duas caixas)", async () => {
    assert.equal((await app.requisitar(`/um/${UUID.toUpperCase()}`)).status, 200);
  });

  it("UUID de qualquer versão/variante passa, como o tipo uuid do Postgres (ex.: o nulo)", async () => {
    assert.equal((await app.requisitar("/um/00000000-0000-0000-0000-000000000000")).status, 200);
  });

  describe("id que não é UUID: 400 'id deve ser um UUID válido', handler não roda", () => {
    const invalidos = {
      "texto qualquer": "abc",
      "número": "123",
      "UUID sem hífens": UUID.replaceAll("-", ""),
      "UUID com um dígito a menos": UUID.slice(0, -1),
      "UUID com um dígito a mais": `${UUID}0`,
      "1º grupo com um dígito a menos": UUID.replace("aaaaaaaa-", "aaaaaaa-"),
      "1º grupo com um dígito a mais": UUID.replace("aaaaaaaa-", "aaaaaaaaa-"),
      "2º grupo com um dígito a menos": UUID.replace("-bbbb-", "-bbb-"),
      "2º grupo com um dígito a mais": UUID.replace("-bbbb-", "-bbbbb-"),
      "3º grupo com um dígito a menos": UUID.replace("-4ccc-", "-4cc-"),
      "3º grupo com um dígito a mais": UUID.replace("-4ccc-", "-4cccc-"),
      "4º grupo com um dígito a menos": UUID.replace("-8ddd-", "-8dd-"),
      "4º grupo com um dígito a mais": UUID.replace("-8ddd-", "-8dddd-"),
      "UUID com caractere não hexadecimal": UUID.replace("a", "g"),
      "UUID com espaço no fim": `${UUID}%20`,
      "tentativa de SQL": encodeURIComponent("1' OR '1'='1"),
      "UUID seguido de lixo": `${UUID}abc`,
      "UUID precedido de lixo": `abc${UUID}`,
      "UUID precedido de hífen": `-${UUID}`,
      "UUID precedido de espaço": `%20${UUID}`,
      "undefined literal": "undefined",
      "null literal": "null",
    };
    for (const [nome, valor] of Object.entries(invalidos)) {
      it(nome, async () => {
        const resposta = await app.requisitar(`/um/${valor}`);
        assert.equal(resposta.status, 400);
        assert.deepEqual(resposta.corpo, { erro: "id deve ser um UUID válido" });
      });
    }
  });

  it("vários parâmetros: o segundo inválido é recusado e nomeado", async () => {
    const resposta = await app.requisitar(`/dois/${UUID}/pares/xyz`);
    assert.equal(resposta.status, 400);
    assert.deepEqual(resposta.corpo, { erro: "pareId deve ser um UUID válido" });
  });

  it("vários parâmetros: o primeiro inválido é recusado e nomeado", async () => {
    const resposta = await app.requisitar(`/dois/xyz/pares/${UUID}`);
    assert.equal(resposta.status, 400);
    assert.deepEqual(resposta.corpo, { erro: "id deve ser um UUID válido" });
  });

  it("vários parâmetros válidos passam", async () => {
    assert.equal((await app.requisitar(`/dois/${UUID}/pares/${UUID}`)).status, 200);
  });

  it("parâmetro que a rota não declara conta como inválido (nome errado no router não passa batido)", async () => {
    const resposta = await app.requisitar("/sem-param");
    assert.equal(resposta.status, 400);
  });

  it("sem nomes, não valida nada (comportamento de borda documentado)", async () => {
    assert.equal((await app.requisitar("/nenhum/qualquer-coisa")).status, 200);
  });
});
