import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { metaCatalogoNcm, ncmExiste } from "../src/utils/ncm.util.js";

describe("ncm.util", () => {
  it("reconhece NCM vigente da snapshot Siscomex (19059090 da v10)", () => {
    assert.equal(ncmExiste("19059090"), true);
    assert.equal(ncmExiste("01012100"), true);
  });

  it("recusa código inexistente, formato errado e tipo errado", () => {
    assert.equal(ncmExiste("99999999"), false);
    assert.equal(ncmExiste("1905909"), false);
    assert.equal(ncmExiste("190590900"), false);
    assert.equal(ncmExiste("1905.90.90"), false);
    assert.equal(ncmExiste(""), false);
    assert.equal(ncmExiste(19059090), false);
    assert.equal(ncmExiste(null), false);
  });

  it("carrega o catálogo uma vez, com milhares de códigos de 8 dígitos", () => {
    const meta = metaCatalogoNcm();
    assert.ok(meta.quantidade > 10000);
    assert.match(String(meta.fonte), /Siscomex/i);
    assert.match(String(meta.snapshot), /^\d{4}-\d{2}-\d{2}$/);
  });
});
