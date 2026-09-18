import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CATALOGO_ESOCIAL } from "../src/utils/esocial-catalogo.util.js";
import {
  EVENTOS,
  eventoSuportado,
  gerarXmlEvento,
  ErroXmlESocial,
} from "../src/utils/esocial-xml.util.js";

// Códigos canônicos dos Grupos 2, 3 e 4 (ES-4). Qualquer inclusão/remoção
// silenciosa no catálogo deve falhar aqui.
const CODIGOS_ESPERADOS = [
  "S-2200",
  "S-2205",
  "S-2206",
  "S-2230",
  "S-2298",
  "S-2299",
  "S-2210",
  "S-2220",
  "S-2240",
  "S-1200",
  "S-1210",
  "S-1299",
];

const SEM_FUNCIONARIO = new Set(["S-2200", "S-1200", "S-1210", "S-1299"]);

describe("CATALOGO_ESOCIAL — códigos válidos", () => {
  it("contém exatamente os 12 códigos dos Grupos 2, 3 e 4", () => {
    const codigos = Object.keys(CATALOGO_ESOCIAL).sort();
    assert.deepEqual(codigos, [...CODIGOS_ESPERADOS].sort());
  });

  it("cada entrada tem grupo (2|3|4), nome e requerFuncionario boolean", () => {
    for (const [codigo, meta] of Object.entries(CATALOGO_ESOCIAL)) {
      assert.ok([2, 3, 4].includes(meta.grupo), `${codigo}: grupo inválido`);
      assert.equal(typeof meta.nome, "string");
      assert.ok(meta.nome.length > 0, `${codigo}: nome vazio`);
      assert.equal(typeof meta.requerFuncionario, "boolean");
    }
  });

  it("requerFuncionario=false só no S-2200 e nos eventos do Grupo 4", () => {
    for (const [codigo, meta] of Object.entries(CATALOGO_ESOCIAL)) {
      assert.equal(
        meta.requerFuncionario,
        !SEM_FUNCIONARIO.has(codigo),
        `${codigo}: requerFuncionario divergente`,
      );
    }
  });

  it("agrupa 6 eventos no G2, 3 no G3 e 3 no G4", () => {
    const contagem = { 2: 0, 3: 0, 4: 0 };
    for (const meta of Object.values(CATALOGO_ESOCIAL)) {
      contagem[meta.grupo] += 1;
    }
    assert.deepEqual(contagem, { 2: 6, 3: 3, 4: 3 });
  });
});

describe("CATALOGO_ESOCIAL — geradorDisponivel (via registro EVENTOS)", () => {
  // No backend a flag `geradorDisponivel` do front espelha `eventoSuportado`:
  // só códigos presentes em EVENTOS têm gerador de XML. Hoje só S-2200.
  it("só S-2200 tem gerador disponível", () => {
    for (const codigo of Object.keys(CATALOGO_ESOCIAL)) {
      const disponivel = eventoSuportado(codigo);
      assert.equal(
        disponivel,
        codigo === "S-2200",
        `${codigo}: geradorDisponivel esperado ${codigo === "S-2200"}`,
      );
    }
  });

  it("todo código em EVENTOS existe no catálogo", () => {
    for (const codigo of Object.keys(EVENTOS)) {
      assert.ok(
        CATALOGO_ESOCIAL[codigo],
        `${codigo} registrado em EVENTOS sem entrada no catálogo`,
      );
    }
  });
});

describe("CATALOGO_ESOCIAL — dispatcher gerarXmlEvento", () => {
  it("código fora do catálogo lança 'desconhecido'", () => {
    assert.throws(
      () => gerarXmlEvento("S-9999", {}, {}),
      (err) => err instanceof ErroXmlESocial && /desconhecido/.test(err.message),
    );
  });

  it("código do catálogo sem gerador lança erro claro (não é erro do usuário)", () => {
    const semGerador = Object.keys(CATALOGO_ESOCIAL).filter((c) => !eventoSuportado(c));
    assert.ok(semGerador.length >= 1);
    for (const codigo of semGerador) {
      assert.throws(
        () => gerarXmlEvento(codigo, {}, {}),
        (err) =>
          err instanceof ErroXmlESocial &&
          /ainda não tem gerador/.test(err.message) &&
          err.message.includes(CATALOGO_ESOCIAL[codigo].nome),
      );
    }
  });
});
