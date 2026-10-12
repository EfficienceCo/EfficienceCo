import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { eventoSuportado } from "../src/utils/esocial-xml.util.js";

// QA-G (2026-09-07), P2 item 6 do relatório do Vinícius: S-2299 (desligamento) e
// S-1200 (remuneração) estavam no catálogo sem gerador de XML. Resolvido no #648.
describe("eSocial — geradores pendentes (QA-G P2)", () => {
  for (const codigo of ["S-2299", "S-1200"]) {
    it(`${codigo} tem gerador de XML registrado`, () => {
      assert.ok(eventoSuportado(codigo));
    });
  }
});
