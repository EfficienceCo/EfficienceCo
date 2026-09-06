import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  lerCertificadoA1,
  ErroCertificadoESocial,
} from "../src/utils/esocial-certificado.util.js";
import { gerarPfxTeste, gerarPfxExpirado } from "./fixtures/esocial-cert-fixture.js";

describe("esocial-certificado.util", () => {
  it("extrai key/cert/transmissor de PFX válido", () => {
    const { buffer, senha, cnpj } = gerarPfxTeste();
    const cred = lerCertificadoA1(buffer, senha);
    assert.match(cred.certificatePem, /BEGIN CERTIFICATE/);
    assert.match(cred.privateKeyPem, /BEGIN RSA PRIVATE KEY|BEGIN PRIVATE KEY/);
    assert.equal(cred.transmissor.tpInsc, 1);
    assert.equal(cred.transmissor.nrInsc, cnpj);
  });

  it("rejeita senha incorreta sem vazar detalhes PKCS12", () => {
    const { buffer } = gerarPfxTeste({ senha: "certo" });
    assert.throws(() => lerCertificadoA1(buffer, "errado"), ErroCertificadoESocial);
    try {
      lerCertificadoA1(buffer, "errado");
    } catch (err) {
      assert.doesNotMatch(String(err.message), /pkcs|asn1|mac verify/i);
    }
  });

  it("rejeita certificado expirado", () => {
    const { buffer, senha } = gerarPfxExpirado();
    assert.throws(() => lerCertificadoA1(buffer, senha), (err) => err.codigo === "CERTIFICADO_EXPIRADO");
  });

  it("não grava PFX em disco durante parse", () => {
    const writes = [];
    const original = fs.writeFileSync;
    fs.writeFileSync = (...args) => {
      writes.push(args[0]);
      return original(...args);
    };
    try {
      const { buffer, senha } = gerarPfxTeste();
      lerCertificadoA1(buffer, senha);
      assert.equal(writes.length, 0);
    } finally {
      fs.writeFileSync = original;
    }
  });
});
