import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseRetornoEnvio,
  parseRetornoProcessamento,
} from "../src/utils/esocial-resposta.util.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(__dirname, "fixtures", "esocial-gov");

function fixture(nome) {
  return fs.readFileSync(path.join(FIX, nome), "utf8");
}

describe("esocial-resposta.util", () => {
  it("A5.1 parseia envio com protocolo (cdResposta 201)", () => {
    const r = parseRetornoEnvio(fixture("retorno-envio-sucesso.xml"));
    assert.equal(r.cdResposta, 201);
    assert.equal(r.protocoloEnvio, "1.2.202608.000000012345678");
    assert.equal(r.sucesso, true);
  });

  it("A5.5 parseia processamento aguardando (cdResposta 101)", () => {
    const r = parseRetornoProcessamento(fixture("retorno-processamento-aguardando.xml"));
    assert.equal(r.cdResposta, 101);
    assert.equal(r.aguardando, true);
  });

  it("A5.3 parseia processamento aceito com nrRecibo", () => {
    const r = parseRetornoProcessamento(fixture("retorno-processamento-aceito.xml"));
    assert.equal(r.sucesso, true);
    assert.equal(r.nrRecibo, "1.2.0001234567890123");
  });

  it("A5.4 parseia rejeição do evento", () => {
    const r = parseRetornoProcessamento(fixture("retorno-processamento-rejeitado.xml"));
    assert.equal(r.sucesso, false);
    assert.match(r.erroEvento, /123: Campo inválido/);
  });
});
