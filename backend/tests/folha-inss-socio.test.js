// FOLHA-1 (#741) — INSS do pró-labore de sócio.
//
// O sócio é contribuinte individual a serviço de empresa: 20% (Lei 8.212/91, art. 21) com dedução
// de 9 pontos (art. 30, §4º) = 11%, descontado pela empresa (Lei 10.666/2003, art. 4º), sem faixas
// e limitado ao teto. Teto (limite da última faixa): 2024 R$ 7.786,02 · 2025 R$ 8.157,41 ·
// 2026 R$ 8.475,55.
//
// Valores esperados: conta feita à mão (oráculo do QA-B de 2026-10-12, lote A, e decisão de
// 2026-11-18 no vault), nunca tirada do código.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calcularFolhaFuncionario,
  calcularINSSContribuinteIndividual,
  gerarHoleritePDF,
  montarCelulasBases,
  montarLinhasVerbas,
  resolverTabelaFolha,
} from "../src/services/folha.service.js";

function linha(sobrescritos = {}) {
  return {
    empresa: "Alfa Ltda",
    funcionario: "Funcionario Teste",
    cpf: "52998224725",
    cargo: "Cargo",
    salario_bruto: 3000,
    dias_trabalhados: 30,
    horas_extras: 0,
    faltas: 0,
    adiantamento: 0,
    num_dependentes: 0,
    vale_transporte: false,
    ...sobrescritos,
  };
}

const MARCOS = linha({ funcionario: "Marcos", cargo: "Socio-administrador", salario_bruto: 10000, categoria: "socio" });
const OLGA = linha({ funcionario: "Olga", cargo: "Socia", salario_bruto: 3000, categoria: "socio" });

function valores(calculo) {
  const { inss, ir, liquido } = calculo;
  return { inss, ir, liquido };
}

describe("calcularINSSContribuinteIndividual — 11% até o teto", () => {
  it("abaixo do teto: 11% da base, sem faixas (3.000 → 330,00)", () => {
    assert.equal(calcularINSSContribuinteIndividual(3000, resolverTabelaFolha("2026-09").inss), 330);
  });

  for (const [competencia, teto, esperado] of [
    ["2024-09", 7786.02, 856.46],
    ["2025-09", 8157.41, 897.32],
    ["2026-09", 8475.55, 932.31],
  ]) {
    it(`acima do teto em ${competencia.slice(0, 4)}: exatamente 11% de ${teto} (${esperado})`, () => {
      const tabela = resolverTabelaFolha(competencia).inss;
      assert.equal(Math.round(calcularINSSContribuinteIndividual(50000, tabela) * 100) / 100, esperado);
      assert.equal(Math.round(calcularINSSContribuinteIndividual(teto + 0.01, tabela) * 100) / 100, esperado);
    });
  }

  it("teto exato de 2026: 8.475,55 × 11% = 932,31", () => {
    const valor = calcularINSSContribuinteIndividual(8475.55, resolverTabelaFolha("2026-09").inss);
    assert.equal(Math.round(valor * 100) / 100, 932.31);
  });

  it("devolve a precisão cheia (quem arredonda é o cálculo da folha)", () => {
    const valor = calcularINSSContribuinteIndividual(8475.55, resolverTabelaFolha("2026-09").inss);
    assert.ok(Math.abs(valor - 932.3105) < 1e-9, String(valor));
  });

  it("base zero: 0", () => {
    assert.equal(calcularINSSContribuinteIndividual(0, resolverTabelaFolha("2026-09").inss), 0);
  });
});

describe("calcularFolhaFuncionario — sócio (QA-B 2026-10-12, P1)", () => {
  it("Marcos, pró-labore 10.000 em 09/2026: INSS 932,31, base IR 9.067,69, IRRF 1.584,88, líquido 7.482,81", () => {
    const calculo = calcularFolhaFuncionario(MARCOS, "2026-09");
    assert.deepEqual(valores(calculo), { inss: 932.31, ir: 1584.88, liquido: 7482.81 });
    assert.equal(calculo.base_ir, 9067.69);
    assert.equal(calculo.base_calculo, 10000);
    assert.equal(calculo.fgts, 0);
    assert.equal(calculo.categoria, "socio");
  });

  it("Olga, pró-labore 3.000 em 09/2026: INSS 330,00, IRRF 0 (rendimento até 5.000), líquido 2.670,00", () => {
    assert.deepEqual(valores(calcularFolhaFuncionario(OLGA, "2026-09")), { inss: 330, ir: 0, liquido: 2670 });
  });

  it("2025: usa o teto de 2025 (10.000 → INSS 897,32, IRRF 1.594,51, líquido 7.508,17)", () => {
    // base IR 10.000 − 897,3151 = 9.102,68; IR 9.102,68 × 27,5% − 908,73 = 1.594,51.
    assert.deepEqual(valores(calcularFolhaFuncionario(MARCOS, "2025-09")), { inss: 897.32, ir: 1594.51, liquido: 7508.17 });
  });

  it("2024: usa o teto de 2024 (10.000 → INSS 856,46, IRRF 1.618,47, líquido 7.525,07)", () => {
    // base IR 10.000 − 856,4622 = 9.143,54; IR 9.143,54 × 27,5% − 896,00 = 1.618,47.
    assert.deepEqual(valores(calcularFolhaFuncionario(MARCOS, "2024-09")), { inss: 856.46, ir: 1618.47, liquido: 7525.07 });
  });

  it("pró-labore no teto exato de 2026 desconta 932,31 (igual ao de 10.000)", () => {
    assert.equal(calcularFolhaFuncionario(linha({ salario_bruto: 8475.55, categoria: "socio" }), "2026-09").inss, 932.31);
  });

  it("não usa a tabela do empregado: o mesmo valor como empregado dá o INSS progressivo", () => {
    // Controle: a diferença vem da categoria, não da entrada.
    assert.equal(calcularFolhaFuncionario({ ...MARCOS, categoria: "empregado" }, "2026-09").inss, 988.09);
    assert.equal(calcularFolhaFuncionario({ ...OLGA, categoria: "empregado" }, "2026-09").inss, 248.6);
  });

  it("HE, faltas e VT do sócio ficam fora da conta; os brutos da planilha seguem no retorno", () => {
    const comExtras = { ...MARCOS, horas_extras: 10, faltas: 2, vale_transporte: true };
    const calculo = calcularFolhaFuncionario(comExtras, "2026-09");
    assert.deepEqual(valores(calculo), { inss: 932.31, ir: 1584.88, liquido: 7482.81 });
    assert.equal(calculo.base_calculo, 10000);
    assert.equal(calculo.valor_horas_extras, 0);
    assert.equal(calculo.valor_faltas, 0);
    assert.equal(calculo.desconto_vt, 0);
    // Auditoria: o que veio da planilha é gravado como veio.
    assert.equal(calculo.horas_extras, 10);
    assert.equal(calculo.faltas, 2);
    assert.equal(calculo.vale_transporte, true);
  });

  it("Olga com faltas e VT: continua 330,00 / 2.670,00", () => {
    const calculo = calcularFolhaFuncionario({ ...OLGA, faltas: 3, horas_extras: 4, vale_transporte: true }, "2026-09");
    assert.deepEqual(valores(calculo), { inss: 330, ir: 0, liquido: 2670 });
  });
});

describe("calcularFolhaFuncionario — empregado inalterado (lote A do QA-B, 13/13)", () => {
  const LOTE_A_EMPREGADOS = [
    ["Ana", { salario_bruto: 1621 }, { inss: 121.58, ir: 0, liquido: 1499.42 }],
    ["Bruno", { salario_bruto: 3000, vale_transporte: true }, { inss: 248.6, ir: 0, liquido: 2571.4 }],
    ["Carla", { salario_bruto: 5000 }, { inss: 501.51, ir: 0, liquido: 4498.49 }],
    // FOLHA-4 (#744): o QA-B anotou 29 dias como "30 menos a falta" e calculou o salário
    // cheio. Desde a FOLHA-4, dias_trabalhados é proporcional e a falta é descontada à parte,
    // então a entrada que corresponde ao oráculo do QA é 30 dias + 1 falta.
    ["Diego", {
      salario_bruto: 6000, dias_trabalhados: 30, horas_extras: 5, faltas: 1, adiantamento: 500,
      num_dependentes: 1, vale_transporte: true,
    }, { inss: 642.15, ir: 334.65, liquido: 4167.75 }],
    ["Elisa", { salario_bruto: 9000, num_dependentes: 2 }, { inss: 988.09, ir: 1190.27, liquido: 6821.64 }],
    ["Fabio", { salario_bruto: 5000.01 }, { inss: 501.52, ir: 0, liquido: 4498.49 }],
    ["Gina", { salario_bruto: 7350 }, { inss: 830.51, ir: 884.13, liquido: 5635.36 }],
    ["Hugo", { salario_bruto: 7350.01 }, { inss: 830.52, ir: 884.13, liquido: 5635.36 }],
    ["Iris", { salario_bruto: 2902.84 }, { inss: 236.94, ir: 0, liquido: 2665.9 }],
    ["Jorge", { salario_bruto: 8475.55 }, { inss: 988.09, ir: 1150.32, liquido: 6337.14 }],
    ["Lia", { salario_bruto: 10000, num_dependentes: 5 }, { inss: 988.09, ir: 1308.86, liquido: 7703.05 }],
    // FOLHA-4 (#744): 15 dias = salário do mês 1.500,00 (o QA-B anotou 2.751,40 como "igual ao app", P4).
    ["Paulo", { salario_bruto: 3000, dias_trabalhados: 15 }, { inss: 112.5, ir: 0, liquido: 1387.5 }],
    ["Quesia", {
      salario_bruto: 2500.5, horas_extras: 2.5, num_dependentes: 1, vale_transporte: true,
    }, { inss: 204.57, ir: 0, liquido: 2188.52 }],
  ];

  for (const [nome, entrada, esperado] of LOTE_A_EMPREGADOS) {
    it(`${nome}: INSS ${esperado.inss}, IRRF ${esperado.ir}, líquido ${esperado.liquido}`, () => {
      const calculo = calcularFolhaFuncionario(linha({ funcionario: nome, ...entrada }), "2026-09");
      assert.deepEqual(valores(calculo), esperado);
      assert.equal(calculo.categoria, "empregado");
    });
  }
});

describe("holerite do sócio (montarLinhasVerbas / montarCelulasBases)", () => {
  it("Marcos: verba PRO-LABORE e INSS CONTRIB. INDIVIDUAL 11% com referência no teto de 2026", () => {
    const calculo = calcularFolhaFuncionario(MARCOS, "2026-09");
    const linhas = montarLinhasVerbas(calculo, "2026-09-01");
    assert.deepEqual(linhas, [
      { verba: "0001", descricao: "PRO-LABORE", referencia: "30", proventos: "10.000,00", descontos: "" },
      { verba: "0011", descricao: "INSS CONTRIB. INDIVIDUAL 11%", referencia: "8.475,55", proventos: "", descontos: "932,31" },
      { verba: "0012", descricao: "IRRF", referencia: "", proventos: "", descontos: "1.584,88" },
    ]);
  });

  it("Olga: referência do INSS é o próprio pró-labore (abaixo do teto)", () => {
    const linhas = montarLinhasVerbas(calcularFolhaFuncionario(OLGA, "2026-09"), "2026-09-01");
    const inss = linhas.find((l) => l.verba === "0011");
    assert.deepEqual(inss, { verba: "0011", descricao: "INSS CONTRIB. INDIVIDUAL 11%", referencia: "3.000,00", proventos: "", descontos: "330,00" });
  });

  it("referência do INSS usa o teto da competência do holerite (2024: 7.786,02)", () => {
    const linhas = montarLinhasVerbas(calcularFolhaFuncionario(MARCOS, "2024-09"), "2024-09-01");
    assert.equal(linhas.find((l) => l.verba === "0011").referencia, "7.786,02");
  });

  it("sócio com HE, faltas e VT na planilha: o holerite não mostra essas verbas (decide pelo calculado)", () => {
    const calculo = calcularFolhaFuncionario({ ...MARCOS, horas_extras: 10, faltas: 2, vale_transporte: true }, "2026-09");
    const descricoes = montarLinhasVerbas(calculo, "2026-09-01").map((l) => l.descricao);
    assert.deepEqual(descricoes, ["PRO-LABORE", "INSS CONTRIB. INDIVIDUAL 11%", "IRRF"]);
    const bases = Object.fromEntries(montarCelulasBases(calculo).map((c) => [c.rotulo, c.texto]));
    assert.equal(bases["TOT. PROVENTOS"], "10.000,00");
    assert.equal(bases["TOT. DESCONTOS"], "2.517,19"); // 932,31 + 1.584,88
  });

  it("rodapé: 'SALAR. BASE' vira 'PRÓ-LABORE'; sem FGTS", () => {
    const bases = Object.fromEntries(
      montarCelulasBases(calcularFolhaFuncionario(MARCOS, "2026-09")).map((c) => [c.rotulo, c.texto]),
    );
    assert.equal(bases["PRÓ-LABORE"], "10.000,00");
    assert.equal("SALAR. BASE" in bases, false);
    assert.equal(bases["BASE FGTS"], "0,00");
    assert.equal(bases["FGTS MES"], "0,00");
    assert.equal(bases["BASE IRRF"], "9.067,69");
  });

  it("holerite de sócio sem competência falha explícito (não usa teto de outro ano)", () => {
    assert.throws(() => montarLinhasVerbas(calcularFolhaFuncionario(MARCOS, "2026-09")), /Competência inválida/);
  });

  it("gerarHoleritePDF do sócio gera um PDF válido", async () => {
    const buffer = await gerarHoleritePDF(calcularFolhaFuncionario(MARCOS, "2026-09"), "09/2026", "2026-09-01");
    assert.equal(buffer.subarray(0, 5).toString("latin1"), "%PDF-");
  });
});

describe("holerite do empregado inalterado", () => {
  it("Diego (HE, falta, adiantamento, VT): mesmas verbas e rótulos de antes", () => {
    const calculo = calcularFolhaFuncionario(linha({
      funcionario: "Diego", salario_bruto: 6000, dias_trabalhados: 30, horas_extras: 5, faltas: 1,
      adiantamento: 500, num_dependentes: 1, vale_transporte: true,
    }), "2026-09");
    assert.deepEqual(montarLinhasVerbas(calculo), [
      { verba: "0001", descricao: "SALARIO BASE", referencia: "30", proventos: "6.000,00", descontos: "" },
      { verba: "0002", descricao: "HORAS EXTRAS 50%", referencia: "5", proventos: "204,55", descontos: "" },
      { verba: "0010", descricao: "FALTAS", referencia: "1", proventos: "", descontos: "200,00" },
      { verba: "0011", descricao: "INSS", referencia: "6.004,55", proventos: "", descontos: "642,15" },
      { verba: "0012", descricao: "IRRF", referencia: "", proventos: "", descontos: "334,65" },
      { verba: "0013", descricao: "ADIANTAMENTO SALARIAL", referencia: "", proventos: "", descontos: "500,00" },
      { verba: "0014", descricao: "VALE-TRANSPORTE (6%)", referencia: "", proventos: "", descontos: "360,00" },
    ]);
    const rotulos = montarCelulasBases(calculo).map((c) => c.rotulo);
    assert.equal(rotulos[0], "SALAR. BASE");
  });

  it("linha legada de folha_calculos (sem categoria) é tratada como empregado", () => {
    const legado = { ...calcularFolhaFuncionario(linha({ salario_bruto: 5000 }), "2026-09") };
    delete legado.categoria;
    assert.deepEqual(montarLinhasVerbas(legado).map((l) => l.descricao), ["SALARIO BASE", "INSS", "IRRF"]);
    assert.equal(montarCelulasBases(legado)[0].rotulo, "SALAR. BASE");
  });
});
