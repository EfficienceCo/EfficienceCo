// TEST-DAS-1 (#729) — motor do DAS com número conferido de fora.
//
// Regra deste arquivo: NENHUM valor esperado sai de simples-nacional.util.js.
// As tabelas abaixo são uma cópia INDEPENDENTE digitada a partir da LC 123/2006
// (Anexos I a V, redação da LC 155/2016, em vigor desde 01/01/2018); os valores
// esperados são contas aritméticas escritas aqui ou literais conferidos à mão.
// Se o util divergir da lei, o teste falha (ou, se o problema já está
// catalogado, fica `skip` com `BUG (sem task ainda — Gerente abre)` ou o número da task — nunca afirmamos o valor errado).
//
// Catálogo: PRB-AP-27, 28, 29, 30, 31 (vault: referencias/catalogo-problemas-apuracao-simples-2026-11.md).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calcularSimplesNacional } from "../src/utils/simples-nacional.util.js";

// ---------------------------------------------------------------------------
// Tabelas da LC 123/2006 — [nº da faixa, limite superior da RBT12, alíquota nominal, parcela a deduzir]
// Fonte: LC 123/2006, Anexo I (comércio), II (indústria), III (serviços),
// IV (serviços, CPP fora do DAS), V (serviços intelectuais).
// ---------------------------------------------------------------------------
const LC123 = {
  I: [
    [1, 180000, 0.04, 0],
    [2, 360000, 0.073, 5940],
    [3, 720000, 0.095, 13860],
    [4, 1800000, 0.107, 22500],
    [5, 3600000, 0.143, 87300],
    [6, 4800000, 0.19, 378000],
  ],
  II: [
    [1, 180000, 0.045, 0],
    [2, 360000, 0.078, 5940],
    [3, 720000, 0.1, 13860],
    [4, 1800000, 0.112, 22500],
    [5, 3600000, 0.147, 85500],
    [6, 4800000, 0.3, 720000],
  ],
  III: [
    [1, 180000, 0.06, 0],
    [2, 360000, 0.112, 9360],
    [3, 720000, 0.135, 17640],
    [4, 1800000, 0.16, 35640],
    [5, 3600000, 0.21, 125640],
    [6, 4800000, 0.33, 648000],
  ],
  IV: [
    [1, 180000, 0.045, 0],
    [2, 360000, 0.09, 8100],
    [3, 720000, 0.102, 12420],
    [4, 1800000, 0.14, 39780],
    [5, 3600000, 0.22, 183780],
    [6, 4800000, 0.33, 828000],
  ],
  V: [
    [1, 180000, 0.155, 0],
    [2, 360000, 0.18, 4500],
    [3, 720000, 0.195, 9900],
    [4, 1800000, 0.205, 17100],
    [5, 3600000, 0.23, 62100],
    [6, 4800000, 0.305, 540000],
  ],
};

const ANEXOS = ["I", "II", "III", "IV", "V"];
// Ponto interior de cada faixa (nenhum é limite).
const PONTO_INTERIOR = { 1: 100000, 2: 270000, 3: 540000, 4: 1000000, 5: 2500000, 6: 4000000 };
const RECEITA_MES = 10000;

// DAS esperado pela fórmula da lei: receita × (RBT12 × nominal − parcela) ÷ RBT12,
// só o resultado final arredondado em centavos. Entradas = literais da LC123 acima.
function dasEsperado(rbt12, receita, nominal, parcela) {
  return Math.round(receita * ((rbt12 * nominal - parcela) / rbt12) * 100) / 100;
}

function aliquotaEfetivaEsperada(rbt12, nominal, parcela) {
  return (rbt12 * nominal - parcela) / rbt12;
}

function assertProximo(real, esperado, mensagem) {
  assert.ok(Math.abs(real - esperado) < 1e-12, `${mensagem}: ${real} != ${esperado}`);
}

// folha12 que mantém o Fator R do Anexo V em ~10% (< 28%) — fica na tabela do V.
const folhaAbaixoDoLimiar = (rbt12) => Math.round(rbt12 * 0.1 * 100) / 100;

function chamar(anexo, rbt12) {
  const params = { rbt12, receita_mes: RECEITA_MES, anexo };
  if (anexo === "V") params.folha12 = folhaAbaixoDoLimiar(rbt12);
  return calcularSimplesNacional(params);
}

// ---------------------------------------------------------------------------
// 1) Uma faixa por teste, 5 anexos × 6 faixas (PRB-AP-27)
// ---------------------------------------------------------------------------
describe("DAS conferido — faixas 1 a 6 dos Anexos I a V (LC 123/2006)", () => {
  for (const anexo of ANEXOS) {
    for (const [n, , nominal, parcela] of LC123[anexo]) {
      const rbt12 = PONTO_INTERIOR[n];
      const origem = `LC 123/2006, Anexo ${anexo}, ${n}ª faixa`;
      const rotuloAnexoV = anexo === "V" ? " (Fator R ≈ 10%, tabela do V)" : "";

      it(`Anexo ${anexo}, ${n}ª faixa${rotuloAnexoV}: nominal ${+(nominal * 100).toFixed(2)}% e parcela ${parcela} (${origem})`, () => {
        const r = chamar(anexo, rbt12);

        assert.equal(r.erro, undefined);
        assert.equal(r.anexo_efetivo, anexo);
        assert.equal(r.faixa_limite, LC123[anexo][n - 1][1]);
        assert.equal(r.aliquota_nominal, nominal);
        assert.equal(r.parcela_deduzir, parcela);
        assertProximo(r.aliquota_efetiva, aliquotaEfetivaEsperada(rbt12, nominal, parcela), "alíquota efetiva");
        assert.equal(r.valor_das, dasEsperado(rbt12, RECEITA_MES, nominal, parcela));
      });
    }
  }
});

// Anexo V com Fator R >= 28% usa a tabela do Anexo III: as 6 faixas do III também
// precisam estar certas quando vindas do V.
describe("DAS conferido — Anexo V com Fator R >= 28% usa a tabela do Anexo III (faixas 1 a 6)", () => {
  for (const [n, , nominal, parcela] of LC123.III) {
    const rbt12 = PONTO_INTERIOR[n];
    it(`Anexo V → III, ${n}ª faixa: nominal ${+(nominal * 100).toFixed(2)}% e parcela ${parcela} (LC 123/2006, Anexo III, ${n}ª faixa; Fator R 1,00)`, () => {
      const r = calcularSimplesNacional({ rbt12, receita_mes: RECEITA_MES, anexo: "V", folha12: rbt12 });

      assert.equal(r.anexo_original, "V");
      assert.equal(r.anexo_efetivo, "III");
      assert.equal(r.fator_r, 1);
      assert.equal(r.faixa_limite, LC123.III[n - 1][1]);
      assert.equal(r.aliquota_nominal, nominal);
      assert.equal(r.parcela_deduzir, parcela);
      assert.equal(r.valor_das, dasEsperado(rbt12, RECEITA_MES, nominal, parcela));
    });
  }
});

// ---------------------------------------------------------------------------
// 2) Pontos de borda (PRB-AP-28): limite é INCLUSIVO na faixa de baixo;
//    limite + 0,01 já é a faixa de cima; 4.800.000,01 é recusado.
// ---------------------------------------------------------------------------
describe("DAS conferido — limites de faixa (inclusive no lado de baixo)", () => {
  for (const anexo of ANEXOS) {
    LC123[anexo].forEach(([n, limite, nominal, parcela]) => {
      const origem = `LC 123/2006, Anexo ${anexo}, ${n}ª faixa (até ${limite.toLocaleString("pt-BR")})`;

      it(`Anexo ${anexo}: RBT12 = ${limite.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} continua na ${n}ª faixa (${origem})`, () => {
        const r = chamar(anexo, limite);

        assert.equal(r.erro, undefined);
        assert.equal(r.faixa_limite, limite);
        assert.equal(r.aliquota_nominal, nominal);
        assert.equal(r.parcela_deduzir, parcela);
        assert.equal(r.valor_das, dasEsperado(limite, RECEITA_MES, nominal, parcela));
      });

      const proxima = LC123[anexo][n];
      const rbtAcima = Math.round((limite + 0.01) * 100) / 100;
      const rotuloAcima = limite.toLocaleString("pt-BR", { minimumFractionDigits: 2 }).replace(/,00$/, ",01");

      if (proxima) {
        const [nProx, limiteProx, nominalProx, parcelaProx] = proxima;
        it(`Anexo ${anexo}: RBT12 = ${rotuloAcima} passa para a ${nProx}ª faixa (LC 123/2006, Anexo ${anexo}, ${nProx}ª faixa)`, () => {
          const r = chamar(anexo, rbtAcima);

          assert.equal(r.erro, undefined);
          assert.equal(r.faixa_limite, limiteProx);
          assert.equal(r.aliquota_nominal, nominalProx);
          assert.equal(r.parcela_deduzir, parcelaProx);
          assert.equal(r.valor_das, dasEsperado(rbtAcima, RECEITA_MES, nominalProx, parcelaProx));
        });
      } else {
        it(`Anexo ${anexo}: RBT12 = 4.800.000,01 é recusado com RBT12_ACIMA_DO_LIMITE (LC 123/2006, art. 3º, II: teto de R$ 4,8 milhões)`, () => {
          assert.deepEqual(chamar(anexo, rbtAcima), { erro: "RBT12_ACIMA_DO_LIMITE" });
        });
      }
    });
  }

  it("Anexo V com Fator R >= 28% também recusa 4.800.000,01 e aceita 4.800.000,00 (tabela do III, 6ª faixa)", () => {
    assert.deepEqual(
      calcularSimplesNacional({ rbt12: 4800000.01, receita_mes: RECEITA_MES, anexo: "V", folha12: 4800000.01 }),
      { erro: "RBT12_ACIMA_DO_LIMITE" },
    );
    const r = calcularSimplesNacional({ rbt12: 4800000, receita_mes: RECEITA_MES, anexo: "V", folha12: 4800000 });
    assert.equal(r.anexo_efetivo, "III");
    assert.equal(r.aliquota_nominal, 0.33);
    assert.equal(r.parcela_deduzir, 648000);
  });
});

// ---------------------------------------------------------------------------
// 3) Números exatos pinados à mão (cenário QA-F que só precisa do motor)
// ---------------------------------------------------------------------------
describe("DAS conferido — contas feitas à mão", () => {
  it("QA-F 2026-10-12, cenário 10: Anexo III, RBT12 3.840.000 → (3,84M × 33% − 648.000) ÷ 3,84M = 16,125% × 320.000 = R$ 51.600,00", () => {
    // 3.840.000 × 0,33 = 1.267.200; − 648.000 = 619.200; ÷ 3.840.000 = 0,16125.
    const r = calcularSimplesNacional({ rbt12: 3840000, receita_mes: 320000, anexo: "III" });
    assert.equal(r.faixa_limite, 4800000);
    assertProximo(r.aliquota_efetiva, 0.16125, "alíquota efetiva");
    assert.equal(r.valor_das, 51600);
  });

  it("QA-F 2026-10-12, cenário 7 (conta): Anexo I, RBT12 312.000 → (312.000 × 7,3% − 5.940) ÷ 312.000 = 5,39615% × 30.000 = R$ 1.618,85", () => {
    // 22.776 − 5.940 = 16.836; ÷ 312.000 = 0,053961538…; × 30.000 = 1.618,846… → 1.618,85
    const r = calcularSimplesNacional({ rbt12: 312000, receita_mes: 30000, anexo: "I" });
    assertProximo(r.aliquota_efetiva, 16836 / 312000, "alíquota efetiva");
    assert.ok(r.aliquota_efetiva > 0.0539615 && r.aliquota_efetiva < 0.0539616);
    assert.equal(r.valor_das, 1618.85);
  });

  it("QA-F 2026-10-12, cenário 8 (conta): Anexo I, RBT12 262.000 → 5,03282% × 25.000 = R$ 1.258,21 (alíquota guardada com mais casas)", () => {
    // 262.000 × 0,073 = 19.126; − 5.940 = 13.186; ÷ 262.000 = 0,0503282…
    // Com a alíquota truncada em 5,03% o DAS seria 1.257,50: o motor NÃO pode arredondar a alíquota.
    const r = calcularSimplesNacional({ rbt12: 262000, receita_mes: 25000, anexo: "I" });
    assert.ok(r.aliquota_efetiva > 0.050328 && r.aliquota_efetiva < 0.050329);
    assert.equal(r.valor_das, 1258.21);
    assert.notEqual(r.valor_das, 1257.5);
  });
});

describe("DAS conferido — RBT12 = 0 (PRB-AP-31)", () => {
  for (const anexo of ["I", "II", "III", "IV"]) {
    it(`Anexo ${anexo}: RBT12 0 usa a alíquota nominal da 1ª faixa (LC 123/2006, Anexo ${anexo}, 1ª faixa, parcela 0): sem NaN/Infinity`, () => {
      const nominal = LC123[anexo][0][2];
      const r = calcularSimplesNacional({ rbt12: 0, receita_mes: 1000, anexo });
      assert.equal(r.aliquota_efetiva, nominal);
      assert.equal(r.valor_das, Math.round(1000 * nominal * 100) / 100);
      assert.equal(Number.isFinite(r.valor_das), true);
    });
  }
});

// ---------------------------------------------------------------------------
// 4) Arredondamento do valor final (PRB-AP-30)
//    PREMISSA (a confirmar com o contador, não é fato normativo verificado): a
//    alíquota efetiva NÃO é arredondada; só o DAS em centavos, com meio-centavo
//    (x,xx5) arredondado PARA CIMA (half-up). Única origem citada: o
//    `arredondar` de src/utils/comum.util.js, que adota half-up. Nenhuma norma
//    foi conferida para o arredondamento do DAS.
// ---------------------------------------------------------------------------
describe("DAS conferido — arredondamento do valor final (premissa half-up a confirmar com o contador: x,xx5 sobe)", () => {
  // [anexo, receita_mes, produto exato (conta à mão), DAS esperado]. RBT12 = 100.000 (1ª faixa:
  // alíquota efetiva = nominal, sem parcela, então o produto é exato em decimal).
  const meioCentavoQueFunciona = [
    ["III", 0.25, "0,25 × 6% = 0,015", 0.02],
    ["III", 0.75, "0,75 × 6% = 0,045", 0.05],
    ["III", 1.25, "1,25 × 6% = 0,075", 0.08],
    ["II", 1, "1,00 × 4,5% = 0,045", 0.05],
    ["II", 3, "3,00 × 4,5% = 0,135", 0.14],
    ["II", 5, "5,00 × 4,5% = 0,225", 0.23],
  ];

  for (const [anexo, receita, conta, esperado] of meioCentavoQueFunciona) {
    it(`Anexo ${anexo} 1ª faixa: ${conta} → R$ ${esperado.toFixed(2).replace(".", ",")} (meio centavo sobe)`, () => {
      const r = calcularSimplesNacional({ rbt12: 100000, receita_mes: receita, anexo });
      assert.equal(r.valor_das, esperado);
    });
  }

  // Meio centavo exato em decimal que o double representa ABAIXO (ex.: 34,25 × 0,06 =
  // 2,0549999999999997) e o motor arredonda para BAIXO. `arredondarMoeda` do util soma
  // Number.EPSILON ABSOLUTO (2,2e-16), que some a partir de ~2 reais; o
  // `arredondar` de comum.util.js usa EPSILON relativo e acerta. No Anexo III
  // 58 de 400 meios-centavos (14,5%) e nos Anexos II e IV 14 de 100 (14,0%) caem nisso
  // (varredura de R$ 0,01 a R$ 200).
  // BUG (sem task ainda — Gerente abre) — PRB-AP-50 (catálogo).
  const meioCentavoQueErra = [
    ["III", 34.25, "34,25 × 6% = 2,055", 2.06],
    ["III", 36.25, "36,25 × 6% = 2,175", 2.18],
    ["III", 39.75, "39,75 × 6% = 2,385", 2.39],
    ["II", 53, "53,00 × 4,5% = 2,385", 2.39],
    ["IV", 67, "67,00 × 4,5% = 3,015", 3.02],
    ["IV", 93, "93,00 × 4,5% = 4,185", 4.19],
  ];

  for (const [anexo, receita, conta, esperado] of meioCentavoQueErra) {
    it(
      `Anexo ${anexo} 1ª faixa: ${conta} → R$ ${esperado.toFixed(2).replace(".", ",")} (meio centavo deve subir)`,
      { skip: "BUG (sem task ainda — Gerente abre) PRB-AP-50: arredondarMoeda do util usa EPSILON absoluto e arredonda x,xx5 para baixo em parte dos casos (float)" },
      () => {
        const r = calcularSimplesNacional({ rbt12: 100000, receita_mes: receita, anexo });
        assert.equal(r.valor_das, esperado);
      },
    );
  }

  it("abaixo de meio centavo desce, acima sobe (sem confundir com o meio exato)", () => {
    // 0,24 × 6% = 0,0144 → 0,01 ; 33,33 × 6% = 1,9998 → 2,00 ; 0,26 × 6% = 0,0156 → 0,02
    assert.equal(calcularSimplesNacional({ rbt12: 100000, receita_mes: 0.24, anexo: "III" }).valor_das, 0.01);
    assert.equal(calcularSimplesNacional({ rbt12: 100000, receita_mes: 33.33, anexo: "III" }).valor_das, 2);
    assert.equal(calcularSimplesNacional({ rbt12: 100000, receita_mes: 0.26, anexo: "III" }).valor_das, 0.02);
  });

  it("a alíquota efetiva não é arredondada: 262.000 / Anexo I mantém ≥ 6 casas e o DAS usa todas", () => {
    const r = calcularSimplesNacional({ rbt12: 262000, receita_mes: 25000, anexo: "I" });
    assert.notEqual(r.aliquota_efetiva, 0.0503);
    assert.notEqual(r.aliquota_efetiva, 0.05);
    assert.equal(r.valor_das, 1258.21);
  });
});

// ---------------------------------------------------------------------------
// 5) Fator R do Anexo V: limiar de 28% e TRUNCAMENTO em 2 casas (PRB-AP-29)
//    Conforme o comentário do util (simples-nacional.util.js:64): o PGDAS-D
//    considera duas casas decimais sem arredondamento. Artigo não conferido.
// ---------------------------------------------------------------------------
describe("DAS conferido — Fator R: limiar 28% e truncamento (não arredonda)", () => {
  const casos = [
    // [descrição, rbt12, folha12, fator esperado, anexo efetivo]
    ["0,2799 → trunca para 0,27 → permanece no Anexo V", 10000, 2799, 0.27, "V"],
    ["0,28 exato → Anexo III", 10000, 2800, 0.28, "III"],
    ["0,2801 → trunca para 0,28 → Anexo III", 10000, 2801, 0.28, "III"],
    ["0,27999 (arredondado daria 0,28; trunca 0,27) → Anexo V", 100000, 27999, 0.27, "V"],
    ["0,279999 (arredondado daria 0,28; trunca 0,27) → Anexo V", 1000000, 279999, 0.27, "V"],
    ["0,2899 → trunca para 0,28 → Anexo III (não sobe para 0,29)", 10000, 2899, 0.28, "III"],
  ];

  for (const [descricao, rbt12, folha12, fatorEsperado, anexoEsperado] of casos) {
    it(`${descricao} (folha ${folha12} ÷ RBT12 ${rbt12})`, () => {
      const r = calcularSimplesNacional({ rbt12, receita_mes: 1000, anexo: "V", folha12 });
      assert.equal(r.fator_r, fatorEsperado);
      assert.equal(r.anexo_efetivo, anexoEsperado);
      // A faixa e o DAS acompanham a tabela do anexo efetivo.
      const [, , nominal, parcela] = LC123[anexoEsperado].find(([, limite]) => rbt12 <= limite);
      assert.equal(r.aliquota_nominal, nominal);
      assert.equal(r.parcela_deduzir, parcela);
    });
  }

  // O Number.EPSILON do truncarFatorR: 29/100 em double é 0,28999999999999998 e
  // sem o EPSILON o Fator R sairia 0,28 em vez de 0,29 (quociente exato = 0,29).
  const quocientesExatosQueOFloatDerruba = [
    [1000, 290, 0.29],
    [2000, 1140, 0.57],
    [1000, 580, 0.58],
  ];
  for (const [rbt12, folha12, fatorEsperado] of quocientesExatosQueOFloatDerruba) {
    it(`quociente exato ${folha12}/${rbt12} = ${fatorEsperado} não vira ${(fatorEsperado - 0.01).toFixed(2)} por erro de float (EPSILON)`, () => {
      const r = calcularSimplesNacional({ rbt12, receita_mes: 100, anexo: "V", folha12 });
      assert.equal(r.fator_r, fatorEsperado);
      assert.equal(r.anexo_efetivo, "III");
    });
  }

  it("limiar: Fator R 0,27 fica no V e 0,28 vai para o III (a alíquota e o DAS mudam)", () => {
    // RBT12 270.000 (2ª faixa). V: (270000 × 18% − 4500) ÷ 270000 = 0,16333…; III: (270000 × 11,2% − 9360) ÷ 270000 = 0,0773333…
    const v = calcularSimplesNacional({ rbt12: 270000, receita_mes: 30000, anexo: "V", folha12: 72900 }); // 0,27
    const iii = calcularSimplesNacional({ rbt12: 270000, receita_mes: 30000, anexo: "V", folha12: 75600 }); // 0,28
    assert.equal(v.fator_r, 0.27);
    assert.equal(v.anexo_efetivo, "V");
    assert.equal(v.valor_das, 4900); // 30.000 × (48.600 − 4.500) ÷ 270.000 = 30.000 × 0,163333… = 4.900
    assert.equal(iii.fator_r, 0.28);
    assert.equal(iii.anexo_efetivo, "III");
    assert.equal(iii.valor_das, 2320); // 30.000 × (30.240 − 9.360) ÷ 270.000 = 30.000 × 0,0773333… = 2.320
  });
});

// ---------------------------------------------------------------------------
// 6) Res. CGSN 140/2018, art. 26 §6º e §7º — Fator R nos casos de borda.
//    Um teste por inciso. A função só recebe (rbt12, folha12): não existe "mês de
//    início" nela. O §6º só é exercitável via entradas JÁ anualizadas (× 12); o que
//    o §6º/§4º exigem do chamador (anualizar a FS12) não existe no controller
//    (ver seção 7 e cenários em simples-nacional-cenarios-qa-f.test.js).
// ---------------------------------------------------------------------------
describe("DAS conferido — Res. CGSN 140/2018, art. 26 §7º (meses seguintes ao início; conforme D1/D2 do sprint, lei não reconferida)", () => {
  it("§7º, I: FS12 = 0 e RBT12 = 0 → Fator R 0,01 (Anexo V)", () => {
    const r = calcularSimplesNacional({ rbt12: 0, receita_mes: 0, anexo: "V", folha12: 0 });
    assert.equal(r.fator_r, 0.01);
    assert.equal(r.anexo_efetivo, "V");
  });

  it("§7º, II: FS12 > 0 e RBT12 = 0 → Fator R 0,28 (Anexo III)", () => {
    const r = calcularSimplesNacional({ rbt12: 0, receita_mes: 0, anexo: "V", folha12: 50000 });
    assert.equal(r.fator_r, 0.28);
    assert.equal(r.anexo_efetivo, "III");
  });

  it("§7º, III: FS12 > 0 e RBT12 > 0 → razão FS12 ÷ RBT12 (truncada em 2 casas)", () => {
    // 90.000 ÷ 300.000 = 0,30 → Anexo III ; 60.000 ÷ 300.000 = 0,20 → Anexo V
    const iii = calcularSimplesNacional({ rbt12: 300000, receita_mes: 1000, anexo: "V", folha12: 90000 });
    const v = calcularSimplesNacional({ rbt12: 300000, receita_mes: 1000, anexo: "V", folha12: 60000 });
    assert.equal(iii.fator_r, 0.3);
    assert.equal(iii.anexo_efetivo, "III");
    assert.equal(v.fator_r, 0.2);
    assert.equal(v.anexo_efetivo, "V");
  });

  // §7º IV / §6º II (Fator R 0,01 com folha zero): conforme D1/D2 do sprint (lei não reconferida nesta sessão).
  it(
    "§7º, IV: FS12 = 0 e RBT12 > 0 → Fator R 0,01 (Anexo V; folha zero é caso previsto e aprovável)",
    { skip: "BUG (DAS-2) PRB-AP-51: o motor devolve fator_r 0 (0 ÷ RBT12) em vez de 0,01; o Anexo (V) acerta, o Fator R registrado não" },
    () => {
      const r = calcularSimplesNacional({ rbt12: 300000, receita_mes: 1000, anexo: "V", folha12: 0 });
      assert.equal(r.fator_r, 0.01);
      assert.equal(r.anexo_efetivo, "V");
    },
  );
});

describe("DAS conferido — Res. CGSN 140/2018, art. 26 §6º (mês de início de atividade; conforme D1/D2 do sprint, lei não reconferida)", () => {
  // ATENÇÃO: não há cobertura real de "mês de início". A função só recebe (rbt12, folha12); os testes
  // I e III abaixo são o mesmo cálculo do §7º II/III, com entradas multiplicadas por 12 (folha e
  // receita do mês × 12). O inciso II é skip porque a regra não existe no código.
  it("§6º, I (mesmo cálculo do §7º, II com entradas × 12; sem noção de mês de início): FS12 = 5.000 × 12 e RBT12 0 → Fator R 0,28", () => {
    const r = calcularSimplesNacional({ rbt12: 0 * 12, receita_mes: 0, anexo: "V", folha12: 5000 * 12 });
    assert.equal(r.fator_r, 0.28);
    assert.equal(r.anexo_efetivo, "III");
  });

  // Conforme D1/D2 do sprint (lei não reconferida nesta sessão).
  it(
    "§6º, II: folha 0 e receita > 0 → Fator R 0,01 (entradas anualizadas: RBT12 = 20.000 × 12, FS12 0)",
    { skip: "BUG (DAS-2) PRB-AP-51: fator_r sai 0 em vez de 0,01; a função não conhece 'mês de início' e a regra não está implementada" },
    () => {
      const r = calcularSimplesNacional({ rbt12: 20000 * 12, receita_mes: 20000, anexo: "V", folha12: 0 * 12 });
      assert.equal(r.fator_r, 0.01);
      assert.equal(r.anexo_efetivo, "V");
    },
  );

  it("§6º, III (mesmo cálculo do §7º, III com entradas × 12; sem noção de mês de início): (6.000 × 12) ÷ (20.000 × 12) = 0,30", () => {
    const r = calcularSimplesNacional({ rbt12: 20000 * 12, receita_mes: 20000, anexo: "V", folha12: 6000 * 12 });
    assert.equal(r.fator_r, 0.3);
    assert.equal(r.anexo_efetivo, "III");
  });
});

// ---------------------------------------------------------------------------
// 7) Art. 26 §4º c/c art. 22 §§2º a 4º — FS12 anualizada com < 13 meses
// ---------------------------------------------------------------------------
describe("DAS conferido — Res. CGSN 140/2018, art. 26 §4º (FS12 anualizada)", () => {
  it("QA-F 2026-10-12, cenário D (art. 26 §4º): RBT12 180.000, FS12 72.000 → Fator R 0,40 → Anexo III 6% → R$ 900,00 sobre 15.000", () => {
    // Conta: FS12 anualizada = (4 meses × 6.000 ÷ 4) × 12 = 72.000; RBT12 = (4 × 15.000 ÷ 4) × 12 = 180.000;
    // Fator R = 72.000 ÷ 180.000 = 0,40 ≥ 0,28 → tabela do III, 1ª faixa: 6%, sem parcela → 15.000 × 6% = 900,00.
    const fs12Anualizada = (4 * 6000 / 4) * 12;
    const rbt12 = (4 * 15000 / 4) * 12;
    assert.equal(fs12Anualizada, 72000);
    assert.equal(rbt12, 180000);

    const r = calcularSimplesNacional({ rbt12, receita_mes: 15000, anexo: "V", folha12: fs12Anualizada });
    assert.equal(r.fator_r, 0.4);
    assert.equal(r.anexo_efetivo, "III");
    assert.equal(r.aliquota_efetiva, 0.06);
    assert.equal(r.valor_das, 900);
  });

  // O motor recebe folha12 pronta. Quem deveria anualizar é o controller
  // (coletarFolha12 → exige 12 processamentos concluídos; senão devolve semDadosFolha).
  // O teste de ponta a ponta dessa regra (cliente D no controller) está, como skip, em
  // simples-nacional-cenarios-qa-f.test.js (BUG DAS-2 / PRB-AP-14).
});
