import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calcularSimplesNacional } from "../src/utils/simples-nacional.util.js";

describe("calcularSimplesNacional — um Anexo por faixa (parcela_deduzir = 0, fácil de verificar à mão)", () => {
  it("Anexo I: RBT12 na 1ª faixa, aliquota_efetiva = aliquota_nominal", () => {
    const r = calcularSimplesNacional({ rbt12: 100000, receita_mes: 10000, anexo: "I" });
    assert.equal(r.aliquota_efetiva, 0.04);
    assert.equal(r.valor_das, 400);
    assert.equal(r.anexo_efetivo, "I");
  });

  it("Anexo II: RBT12 na 1ª faixa", () => {
    const r = calcularSimplesNacional({ rbt12: 100000, receita_mes: 10000, anexo: "II" });
    assert.equal(r.aliquota_efetiva, 0.045);
    assert.equal(r.valor_das, 450);
  });

  it("Anexo III: RBT12 na 1ª faixa", () => {
    const r = calcularSimplesNacional({ rbt12: 100000, receita_mes: 10000, anexo: "III" });
    assert.equal(r.aliquota_efetiva, 0.06);
    assert.equal(r.valor_das, 600);
  });

  it("Anexo IV: RBT12 na 1ª faixa", () => {
    const r = calcularSimplesNacional({ rbt12: 100000, receita_mes: 10000, anexo: "IV" });
    assert.equal(r.aliquota_efetiva, 0.045);
    assert.equal(r.valor_das, 450);
  });

  it("Anexo V: RBT12 na 1ª faixa, Fator R < 28% permanece no Anexo V", () => {
    const r = calcularSimplesNacional({ rbt12: 100000, receita_mes: 10000, anexo: "V", folha12: 10000 });
    assert.equal(r.fator_r, 0.1);
    assert.equal(r.anexo_efetivo, "V");
    assert.equal(r.aliquota_efetiva, 0.155);
    assert.equal(r.valor_das, 1550);
  });
});

describe("calcularSimplesNacional — faixa com parcela a deduzir", () => {
  it("Anexo I, RBT12 = 250.000, receita do mês = 20.000 → DAS = 984,80", () => {
    // O PGDAS-D preserva todas as casas: alíquota = 0,04924; DAS = 984,80.
    const r = calcularSimplesNacional({ rbt12: 250000, receita_mes: 20000, anexo: "I" });
    assert.equal(r.aliquota_nominal, 0.073);
    assert.equal(r.parcela_deduzir, 5940);
    assert.equal(r.aliquota_efetiva, 0.04924);
    assert.equal(r.valor_das, 984.8);
  });

  it("arredonda somente o valor monetário final para centavos", () => {
    const r = calcularSimplesNacional({ rbt12: 250000, receita_mes: 12345.67, anexo: "I" });
    assert.equal(r.valor_das, 607.9);
  });
});

describe("calcularSimplesNacional — Fator R (Anexo V)", () => {
  it("Fator R >= 28% → usa a tabela do Anexo III", () => {
    // fator_r = 200000 / 500000 = 0.40 >= 0.28
    const r = calcularSimplesNacional({ rbt12: 500000, receita_mes: 40000, anexo: "V", folha12: 200000 });
    assert.equal(r.fator_r, 0.4);
    assert.equal(r.anexo_original, "V");
    assert.equal(r.anexo_efetivo, "III");
    // (500000 * 0.135 - 17640) / 500000 = 0.09972 → DAS = 3988,80
    assert.equal(r.aliquota_efetiva, 0.09972);
    assert.equal(r.valor_das, 3988.8);
  });

  it("Fator R < 28% → permanece no Anexo V", () => {
    // fator_r = 100000 / 500000 = 0.20 < 0.28
    const r = calcularSimplesNacional({ rbt12: 500000, receita_mes: 40000, anexo: "V", folha12: 100000 });
    assert.equal(r.fator_r, 0.2);
    assert.equal(r.anexo_efetivo, "V");
    // (500000 * 0.195 - 9900) / 500000 = 0.1752 → DAS = 40000 * 0.1752 = 7008,00
    assert.equal(r.aliquota_efetiva, 0.1752);
    assert.equal(r.valor_das, 7008);
  });

  it("Fator R exatamente 28% conta como >= (usa Anexo III)", () => {
    const r = calcularSimplesNacional({ rbt12: 100000, receita_mes: 10000, anexo: "V", folha12: 28000 });
    assert.equal(r.fator_r, 0.28);
    assert.equal(r.anexo_efetivo, "III");
  });

  it("Fator R é truncado em duas casas sem arredondamento", () => {
    const r = calcularSimplesNacional({ rbt12: 100000, receita_mes: 10000, anexo: "V", folha12: 27999 });
    assert.equal(r.fator_r, 0.27);
    assert.equal(r.anexo_efetivo, "V");
  });

  it("semDadosFolha: true → retorna erro FATOR_R_SEM_FOLHA sem calcular nada", () => {
    const r = calcularSimplesNacional({ rbt12: 500000, receita_mes: 40000, anexo: "V", semDadosFolha: true });
    assert.deepEqual(r, { erro: "FATOR_R_SEM_FOLHA" });
  });
});

describe("calcularSimplesNacional — RBT12 = 0 (sem faturamento nos últimos 12 meses)", () => {
  it("Anexo I: não gera NaN/Infinity — aliquota_efetiva cai pro nominal e DAS fica 0", () => {
    const r = calcularSimplesNacional({ rbt12: 0, receita_mes: 0, anexo: "I" });
    assert.equal(r.aliquota_efetiva, 0.04);
    assert.equal(r.valor_das, 0);
    assert.equal(Number.isFinite(r.aliquota_efetiva), true);
    assert.equal(Number.isFinite(r.valor_das), true);
  });

  it("Anexo V: folha e receita zeradas resultam em Fator R 0,01", () => {
    const r = calcularSimplesNacional({ rbt12: 0, receita_mes: 0, anexo: "V", folha12: 0 });
    assert.equal(r.fator_r, 0.01);
    assert.equal(r.anexo_efetivo, "V");
    assert.equal(Number.isFinite(r.aliquota_efetiva), true);
    assert.equal(r.valor_das, 0);
  });

  it("Anexo V: folha positiva e receita zerada resultam em Fator R 0,28", () => {
    const r = calcularSimplesNacional({ rbt12: 0, receita_mes: 0, anexo: "V", folha12: 100 });
    assert.equal(r.fator_r, 0.28);
    assert.equal(r.anexo_efetivo, "III");
  });
});

describe("calcularSimplesNacional — erros", () => {
  it("RBT12 acima de 4.800.000 → erro RBT12_ACIMA_DO_LIMITE", () => {
    const r = calcularSimplesNacional({ rbt12: 5000000, receita_mes: 100000, anexo: "I" });
    assert.deepEqual(r, { erro: "RBT12_ACIMA_DO_LIMITE" });
  });

  it("Anexo inválido → erro ANEXO_INVALIDO", () => {
    const r = calcularSimplesNacional({ rbt12: 100000, receita_mes: 10000, anexo: "VI" });
    assert.deepEqual(r, { erro: "ANEXO_INVALIDO" });
  });

  it("rejeita valores negativos e folha ausente", () => {
    assert.deepEqual(
      calcularSimplesNacional({ rbt12: -1, receita_mes: 100, anexo: "I" }),
      { erro: "RBT12_INVALIDO" },
    );
    assert.deepEqual(
      calcularSimplesNacional({ rbt12: 100, receita_mes: -1, anexo: "I" }),
      { erro: "RECEITA_MES_INVALIDA" },
    );
    assert.deepEqual(
      calcularSimplesNacional({ rbt12: 100, receita_mes: 10, anexo: "V" }),
      { erro: "FATOR_R_SEM_FOLHA" },
    );
  });
});
