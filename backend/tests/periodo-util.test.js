import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  aplicarFiltroPeriodo,
  competenciaEstaFechada,
  hojeNoBrasil,
  ultimaCompetenciaFechada,
} from "../src/utils/periodo.util.js";

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

  // Achado do Victor no review do PR #316: Number.parseInt para no primeiro
  // caractere inválido em vez de rejeitar a string inteira, então "7abc"
  // virava mês 7 válido. Number() exige a string inteira numérica.
  it("ignora o filtro quando mes tem sufixo não numérico (ex.: 7abc)", () => {
    const { query, chamadas } = criarQueryFake();

    assert.doesNotThrow(() => aplicarFiltroPeriodo(query, "data_emissao", "7abc", "2026"));
    assert.deepEqual(chamadas, [
      ["gte", "data_emissao", "2026-01-01"],
      ["lte", "data_emissao", "2026-12-31"],
    ]);
  });

  it("ignora o filtro quando mes é decimal (ex.: 7.9)", () => {
    const { query, chamadas } = criarQueryFake();

    assert.doesNotThrow(() => aplicarFiltroPeriodo(query, "data_emissao", "7.9", "2026"));
    assert.deepEqual(chamadas, [
      ["gte", "data_emissao", "2026-01-01"],
      ["lte", "data_emissao", "2026-12-31"],
    ]);
  });

  it("ignora o filtro quando ano tem sufixo não numérico (ex.: 2026xyz)", () => {
    const { query, chamadas } = criarQueryFake();

    assert.doesNotThrow(() => aplicarFiltroPeriodo(query, "data_emissao", "7", "2026xyz"));
    assert.deepEqual(chamadas, []);
  });
});

describe("hojeNoBrasil", () => {
  it("usa o dia do Brasil, não o do UTC, depois das 21:00 (BRT)", () => {
    assert.equal(hojeNoBrasil(new Date("2026-09-30T23:30:00-03:00")), "2026-09-30");
    assert.equal(hojeNoBrasil(new Date("2026-10-01T00:30:00-03:00")), "2026-10-01");
  });
});

describe("ultimaCompetenciaFechada", () => {
  it("devolve o mês anterior ao corrente", () => {
    assert.deepEqual(ultimaCompetenciaFechada(new Date("2026-09-19T12:00:00-03:00")), { ano: 2026, mes: 8 });
  });

  it("vira o ano quando o mês corrente é janeiro", () => {
    assert.deepEqual(ultimaCompetenciaFechada(new Date("2027-01-05T12:00:00-03:00")), { ano: 2026, mes: 12 });
  });

  it("no último dia do mês, o mês ainda não fechou mesmo já sendo dia 1º em UTC", () => {
    // 30/09 23:30 BRT = 01/10 02:30 UTC. Com toISOString() a última fechada
    // seria setembro, liberando a apuração três horas antes do mês fechar.
    assert.deepEqual(ultimaCompetenciaFechada(new Date("2026-09-30T23:30:00-03:00")), { ano: 2026, mes: 8 });
  });
});

describe("competenciaEstaFechada", () => {
  const agora = new Date("2026-09-19T12:00:00-03:00");

  it("aceita a última competência fechada e as anteriores", () => {
    assert.equal(competenciaEstaFechada(2026, 8, agora), true);
    assert.equal(competenciaEstaFechada(2026, 1, agora), true);
    assert.equal(competenciaEstaFechada(2020, 12, agora), true);
  });

  it("recusa o mês corrente, ainda em aberto", () => {
    assert.equal(competenciaEstaFechada(2026, 9, agora), false);
  });

  it("recusa competência futura, no mesmo ano ou à frente", () => {
    assert.equal(competenciaEstaFechada(2026, 12, agora), false);
    assert.equal(competenciaEstaFechada(2027, 6, agora), false);
  });
});
