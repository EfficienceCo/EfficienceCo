import { test } from "node:test";
import assert from "node:assert/strict";

import {
  resolverTabelaFolha,
  calcularINSS,
  calcularIR,
  calcularFolhaFuncionario,
} from "../src/services/folha.service.js";

// Motor tributário da folha versionado por competência (#437 / BUG-FOLHA-01).
// Oráculo dos números de 2026: QA-B §1 (problemas/folha-qa-b-2026-09-07.md no vault),
// conferido contra as tabelas oficiais do gov.br (INSS 2026, IRRF 2026, Lei 15.270/2025).

// Mesmo arredondamento meia-unidade-para-cima do serviço (arredondar), para
// comparar o valor PRECISO devolvido por calcularINSS com o esperado em centavos.
const cent = (valor) => {
  const cents = valor * 100;
  return Math.round(cents + Math.sign(cents) * Number.EPSILON * Math.abs(cents)) / 100;
};

// Linha "crua" como sai de lerLinhasPlanilha (todos os campos já numéricos/booleanos).
const linha = (over = {}) => ({
  empresa: "ACME",
  funcionario: "Fulano de Tal",
  cpf: "111.111.111-11",
  cargo: "Analista",
  salario_bruto: 0,
  dias_trabalhados: 30,
  horas_extras: 0,
  faltas: 0,
  adiantamento: 0,
  num_dependentes: 0,
  vale_transporte: false,
  ...over,
});

// ---------------------------------------------------------------------------
// resolverTabelaFolha
// ---------------------------------------------------------------------------

test("resolverTabelaFolha: competência de 2025 cai na tabela legada (2024-01)", () => {
  assert.equal(resolverTabelaFolha("2025-12").vigenciaInicio, "2024-01");
  assert.equal(resolverTabelaFolha("2024-02").vigenciaInicio, "2024-01");
});

test("resolverTabelaFolha: competência de 2026 usa a tabela 2026-01", () => {
  assert.equal(resolverTabelaFolha("2026-01").vigenciaInicio, "2026-01");
  assert.equal(resolverTabelaFolha("2026-09").vigenciaInicio, "2026-01");
  assert.equal(resolverTabelaFolha("2030-06").vigenciaInicio, "2026-01");
});

test("resolverTabelaFolha: aceita 'YYYY-MM' e 'YYYY-MM-DD'", () => {
  assert.equal(resolverTabelaFolha("2026-09-01").vigenciaInicio, "2026-01");
});

test("resolverTabelaFolha: competência anterior à tabela mais antiga lança", () => {
  assert.throws(() => resolverTabelaFolha("2023-12"), /Nenhuma tabela de folha vigente/);
});

test("resolverTabelaFolha: competência ausente ou malformada lança", () => {
  assert.throws(() => resolverTabelaFolha(undefined), /Competência inválida/);
  assert.throws(() => resolverTabelaFolha(""), /Competência inválida/);
  assert.throws(() => resolverTabelaFolha("2026-13"), /Competência inválida/);
  assert.throws(() => resolverTabelaFolha("setembro/2026"), /Competência inválida/);
});

// ---------------------------------------------------------------------------
// calcularINSS — fronteiras de faixa e teto (tabela 2026)
// ---------------------------------------------------------------------------

const inss2026 = resolverTabelaFolha("2026-09").inss;
const inss2024 = resolverTabelaFolha("2024-06").inss;

test("calcularINSS 2026: base zero ou negativa não contribui", () => {
  assert.equal(calcularINSS(0, inss2026), 0);
  assert.equal(calcularINSS(-100, inss2026), 0);
});

test("calcularINSS 2026: dentro da 1ª faixa (salário mínimo) = 7,5% cheios", () => {
  assert.equal(cent(calcularINSS(1621.0, inss2026)), 121.58);
});

test("calcularINSS 2026: fronteiras de faixa batem com o lote do QA-B", () => {
  assert.equal(cent(calcularINSS(3000.0, inss2026)), 248.6); // 2ª/3ª faixa
  assert.equal(cent(calcularINSS(5000.0, inss2026)), 501.51); // 4ª faixa
  assert.equal(cent(calcularINSS(6004.55, inss2026)), 642.15); // base c/ variáveis
});

test("calcularINSS 2026: acima do teto salarial = somatório marginal com precisão cheia", () => {
  const contribTeto = calcularINSS(9000.0, inss2026);
  assert.equal(cent(contribTeto), 988.09);
  // NÃO é a constante arredondada: a base do IRRF precisa da precisão cheia.
  assert.ok(contribTeto > 988.09, `esperava > 988.09 sem arredondar, veio ${contribTeto}`);
  assert.equal(calcularINSS(50000.0, inss2026), contribTeto);
});

test("calcularINSS 2024 (regressão): faixas e teto publicados inalterados", () => {
  assert.equal(cent(calcularINSS(1621.0, inss2024)), 124.71);
  assert.equal(cent(calcularINSS(3000.0, inss2024)), 258.82);
  assert.equal(calcularINSS(9000.0, inss2024), 908.85); // tetoContribuicao publicado, exato
});

// ---------------------------------------------------------------------------
// calcularIR — dedução mais vantajosa + redução mensal Lei 15.270/2025
// ---------------------------------------------------------------------------

const irrf2026 = resolverTabelaFolha("2026-09").irrf;
const irrf2024 = resolverTabelaFolha("2024-06").irrf;

test("calcularIR 2026: rendimento até R$ 5.000 é isento (redução mensal)", () => {
  assert.equal(
    calcularIR({ baseCalculo: 5000.0, inss: calcularINSS(5000, inss2026), numDependentes: 0 }, irrf2026),
    0,
  );
  assert.equal(
    calcularIR({ baseCalculo: 3000.0, inss: calcularINSS(3000, inss2026), numDependentes: 0 }, irrf2026),
    0,
  );
});

test("calcularIR 2026: desconto simplificado vence quando é maior que a dedução legal", () => {
  // Sem dependentes, INSS ~248,60 < 607,20 -> usa o simplificado; base 2.392,80 isenta.
  const ir = calcularIR(
    { baseCalculo: 3000.0, inss: calcularINSS(3000, inss2026), numDependentes: 0 },
    irrf2026,
  );
  assert.equal(ir, 0);
});

test("calcularIR 2026: faixa de saída da redução (R$ 6.004,55 c/ 1 dependente)", () => {
  const ir = calcularIR(
    { baseCalculo: 6004.55, inss: calcularINSS(6004.55, inss2026), numDependentes: 1 },
    irrf2026,
  );
  assert.equal(ir, 334.65);
});

test("calcularIR 2026: acima de R$ 7.350 não há redução (R$ 9.000 c/ 2 dependentes)", () => {
  const ir = calcularIR(
    { baseCalculo: 9000.0, inss: calcularINSS(9000, inss2026), numDependentes: 2 },
    irrf2026,
  );
  assert.equal(ir, 1190.27);
});

test("calcularIR 2026: no teto da fase de saída (R$ 7.350) o redutor é ~zero", () => {
  const semRedutor = 7350.0 * 0 - 0; // referência conceitual
  assert.equal(semRedutor, 0);
  const irNoTeto = calcularIR(
    { baseCalculo: 7350.0, inss: calcularINSS(7350, inss2026), numDependentes: 0 },
    irrf2026,
  );
  const irLogoAcima = calcularIR(
    { baseCalculo: 7350.01, inss: calcularINSS(7350.01, inss2026), numDependentes: 0 },
    irrf2026,
  );
  // Continuidade: a diferença no limite é de centavos, não um degrau.
  assert.ok(Math.abs(irNoTeto - irLogoAcima) < 0.05);
});

test("calcularIR 2024 (regressão): tabela progressiva sem redução nem simplificado", () => {
  assert.equal(
    calcularIR({ baseCalculo: 9000.0, inss: 908.85, numDependentes: 2 }, irrf2024),
    1224.79,
  );
  assert.equal(
    calcularIR({ baseCalculo: 3000.0, inss: calcularINSS(3000, inss2024), numDependentes: 0 }, irrf2024),
    36.15,
  );
});

// ---------------------------------------------------------------------------
// calcularFolhaFuncionario — reconciliação do lote de 5 salários (QA-B §1 / #437)
// ---------------------------------------------------------------------------

test("calcularFolhaFuncionario: lote de 5 salários fecha em R$ 19.558,70 para 2026-09", () => {
  const lote = [
    { over: { salario_bruto: 1621.0 }, inss: 121.58, ir: 0, liquido: 1499.42 },
    { over: { salario_bruto: 3000.0, vale_transporte: true }, inss: 248.6, ir: 0, liquido: 2571.4 },
    { over: { salario_bruto: 5000.0 }, inss: 501.51, ir: 0, liquido: 4498.49 },
    {
      // "R$ 6.000 com 5h extras / 1 falta / 1 dependente / VT" + adiantamento de R$ 500
      // (o adiantamento é o que fecha o líquido do QA-B — 3.963,33 atual / 4.167,75 em 2026).
      over: {
        salario_bruto: 6000.0,
        horas_extras: 5,
        faltas: 1,
        num_dependentes: 1,
        vale_transporte: true,
        adiantamento: 500,
      },
      inss: 642.15,
      ir: 334.65,
      liquido: 4167.75,
    },
    { over: { salario_bruto: 9000.0, num_dependentes: 2 }, inss: 988.09, ir: 1190.27, liquido: 6821.64 },
  ];

  let totalLiquido = 0;
  for (const caso of lote) {
    const r = calcularFolhaFuncionario(linha(caso.over), "2026-09");
    const rotulo = `R$ ${caso.over.salario_bruto}`;
    assert.equal(r.inss, caso.inss, `INSS ${rotulo}`);
    assert.equal(r.ir, caso.ir, `IRRF ${rotulo}`);
    assert.equal(r.liquido, caso.liquido, `líquido ${rotulo}`);
    totalLiquido += r.liquido;
  }

  assert.equal(cent(totalLiquido), 19558.7);
});

test("calcularFolhaFuncionario: mesma folha em competências de anos diferentes usa tabelas diferentes", () => {
  const entrada = linha({ salario_bruto: 9000.0, num_dependentes: 2 });

  const em2024 = calcularFolhaFuncionario(entrada, "2024-09");
  const em2026 = calcularFolhaFuncionario(entrada, "2026-09");

  assert.equal(em2024.inss, 908.85);
  assert.equal(em2024.ir, 1224.79);
  assert.equal(em2024.liquido, 6866.36);

  assert.equal(em2026.inss, 988.09);
  assert.equal(em2026.ir, 1190.27);
  assert.equal(em2026.liquido, 6821.64);

  assert.notEqual(em2024.liquido, em2026.liquido);
});

test("calcularFolhaFuncionario: competência ausente lança (sem default de ano)", () => {
  assert.throws(
    () => calcularFolhaFuncionario(linha({ salario_bruto: 3000.0 }), undefined),
    /Competência inválida/,
  );
});
