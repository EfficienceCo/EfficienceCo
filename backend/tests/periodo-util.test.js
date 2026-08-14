import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { aplicarFiltroPeriodo } from "../src/utils/periodo.util.js";

function criarQueryFake() {
  const chamadas = [];
  const query = {
    gte(campo, valor) {
      chamadas.push(["gte", campo, valor]);
      return query;
    },
    lte(campo, valor) {
      chamadas.push(["lte", campo, valor]);
      return query;
    },
  };
  return { query, chamadas };
}

describe("aplicarFiltroPeriodo", () => {
  it("filtra pelo intervalo do mês quando mes e ano são válidos", () => {
    const { query, chamadas } = criarQueryFake();
    aplicarFiltroPeriodo(query, "data_emissao", 7, 2026);

    assert.deepEqual(chamadas, [
      ["gte", "data_emissao", "2026-07-01"],
      ["lte", "data_emissao", "2026-07-31"],
    ]);
  });

  it("calcula corretamente o último dia de fevereiro em ano bissexto", () => {
    const { query, chamadas } = criarQueryFake();
    aplicarFiltroPeriodo(query, "data_emissao", 2, 2028);

    assert.deepEqual(chamadas, [
      ["gte", "data_emissao", "2028-02-01"],
      ["lte", "data_emissao", "2028-02-29"],
    ]);
  });

  it("filtra pelo ano inteiro quando só ano é informado", () => {
    const { query, chamadas } = criarQueryFake();
    aplicarFiltroPeriodo(query, "data_emissao", undefined, 2026);

    assert.deepEqual(chamadas, [
      ["gte", "data_emissao", "2026-01-01"],
      ["lte", "data_emissao", "2026-12-31"],
    ]);
  });

  it("não filtra quando mes e ano estão ausentes", () => {
    const { query, chamadas } = criarQueryFake();
    const resultado = aplicarFiltroPeriodo(query, "data_emissao", undefined, undefined);

    assert.equal(resultado, query);
    assert.deepEqual(chamadas, []);
  });

  it("ignora o filtro em vez de lançar quando mes/ano não são numéricos", () => {
    const { query, chamadas } = criarQueryFake();

    assert.doesNotThrow(() => aplicarFiltroPeriodo(query, "data_emissao", "abc", "2026"));
    assert.deepEqual(chamadas, [
      ["gte", "data_emissao", "2026-01-01"],
      ["lte", "data_emissao", "2026-12-31"],
    ]);
  });

  it("ignora o filtro quando mes está fora da faixa 1-12", () => {
    const { query, chamadas } = criarQueryFake();

    assert.doesNotThrow(() => aplicarFiltroPeriodo(query, "data_emissao", 13, 2026));
    assert.deepEqual(chamadas, [
      ["gte", "data_emissao", "2026-01-01"],
      ["lte", "data_emissao", "2026-12-31"],
    ]);
  });
});
