import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";
import * as folha from "../src/services/folha.service.js";

const {
  COLUNAS_FOLHA,
  calcularFolhaFuncionario,
  calcularINSS,
  calcularIR,
  calcularTotaisEmpresa,
  lerLinhasPlanilha,
  resolverTabelaFolha,
} = folha;

// TEST-FOLHA-1 (#749). As contas esperadas são literais do QA ou foram
// refeitas em Decimal a partir das fontes abaixo, sem importar o serviço.
// QA-B: problemas/folha-qa-b-2026-10-12.md no vault, lotes A, C e E.
// INSS: Anexo II das Portarias Interministeriais MPS/MF nº 2/2024, 6/2025 e 13/2026.
// https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal
// IRRF: tabela mensal da Receita Federal de cada ano e Lei 15.270/2025.
// https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/copy_of_2024
// https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2025
// https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026

const COMPETENCIA_QA = "2026-09";
const ORIGEM_QA = "QA-B 2026-10-12";

function linha(campos) {
  return {
    empresa: "Alfa Ltda",
    funcionario: "Pessoa fictícia",
    cpf: "529.982.247-25",
    cargo: "Analista",
    dias_trabalhados: 30,
    horas_extras: 0,
    faltas: 0,
    adiantamento: 0,
    num_dependentes: 0,
    vale_transporte: false,
    categoria: "empregado",
    ...campos,
  };
}

async function lerLinhaExcel(campos) {
  const arquivo = new ExcelJS.Workbook();
  const planilha = arquivo.addWorksheet("Folha");
  planilha.addRow(COLUNAS_FOLHA.map(({ header }) => header));
  const dados = linha(campos);
  planilha.addRow(COLUNAS_FOLHA.map(({ key }) => dados[key]));
  return lerLinhasPlanilha(await arquivo.xlsx.writeBuffer());
}

function conferirValores(calculo, esperados) {
  for (const [campo, esperado] of Object.entries(esperados)) {
    assert.equal(calculo[campo], esperado, campo);
  }
}

// Os 14 casos da issue, na mesma ordem. Paulo (P4) pertence ao oráculo original,
// mas fica fora da tabela do card porque a regra de proporcionalidade é da #744.
const lote = [
  ["Ana", { salario_bruto: 1621 },
    { inss: 121.58, ir: 0, fgts: 129.68, base_ir: 1013.80, liquido: 1499.42 }],
  ["Bruno", { salario_bruto: 3000, vale_transporte: true },
    { inss: 248.60, ir: 0, fgts: 240, base_ir: 2392.80, desconto_vt: 180, liquido: 2571.40 }],
  ["Carla", { salario_bruto: 5000 },
    { inss: 501.51, ir: 0, fgts: 400, base_ir: 4392.80, liquido: 4498.49 }],
  // O QA registrou 29 dias após a falta. O campo recebe 30 dias de vínculo
  // para descontar a falta uma vez (vault: decisoes/2026-11-18-folha-4-faixas-dias-competencia).
  ["Diego", {
    salario_bruto: 6000, dias_trabalhados: 30, horas_extras: 5, faltas: 1,
    adiantamento: 500, num_dependentes: 1, vale_transporte: true,
  }, {
    inss: 642.15, ir: 334.65, fgts: 480.36, base_ir: 5172.81, base_calculo: 6004.55,
    valor_horas_extras: 204.55, valor_faltas: 200, desconto_vt: 360, liquido: 4167.75,
  }],
  ["Elisa", { salario_bruto: 9000, num_dependentes: 2 },
    { inss: 988.09, ir: 1190.27, fgts: 720, base_ir: 7632.73, liquido: 6821.64 }],
  ["Fabio", { salario_bruto: 5000.01 },
    { inss: 501.52, ir: 0, fgts: 400, base_ir: 4392.81, liquido: 4498.49 }],
  ["Gina", { salario_bruto: 7350 },
    { inss: 830.51, ir: 884.13, fgts: 588, base_ir: 6519.49, liquido: 5635.36 }],
  ["Hugo", { salario_bruto: 7350.01 },
    { inss: 830.52, ir: 884.13, fgts: 588, base_ir: 6519.49, liquido: 5635.36 }],
  ["Iris", { salario_bruto: 2902.84 },
    { inss: 236.94, ir: 0, fgts: 232.23, base_ir: 2295.64, liquido: 2665.90 }],
  ["Jorge", { salario_bruto: 8475.55 },
    { inss: 988.09, ir: 1150.32, fgts: 678.04, base_ir: 7487.46, liquido: 6337.14 }],
  ["Lia", { salario_bruto: 10000, num_dependentes: 5 },
    { inss: 988.09, ir: 1308.86, fgts: 800, base_ir: 8063.96, liquido: 7703.05 }],
  ["Marcos", { salario_bruto: 10000, categoria: "socio" },
    { inss: 932.31, ir: 1584.88, fgts: 0, base_ir: 9067.69, liquido: 7482.81 }],
  ["Olga", { salario_bruto: 3000, categoria: "socio" },
    { inss: 330, ir: 0, fgts: 0, base_ir: 2392.80, liquido: 2670 }],
];

for (const [indice, [funcionario, campos, esperados]] of lote.entries()) {
  const titulo = `${ORIGEM_QA}, caso ${indice + 1} — ${funcionario}`;
  const skip = campos.categoria === "socio" ? "BUG (FOLHA-1) #741" : false;
  test(titulo, { skip }, () => {
    const calculo = calcularFolhaFuncionario(linha({ funcionario, ...campos }), COMPETENCIA_QA);
    conferirValores(calculo, esperados);
  });
}

test(`${ORIGEM_QA}, caso 14 — Quésia: células em texto chegam ao cálculo`, async () => {
  const { linhas, erros } = await lerLinhaExcel({
    funcionario: "Quésia", salario_bruto: "2.500,50", horas_extras: "2,5",
    vale_transporte: "sim", num_dependentes: 1,
  });
  assert.deepEqual(erros, []);
  assert.equal(linhas.length, 1);
  conferirValores(linhas[0], { salario_bruto: 2500.50, horas_extras: 2.5, vale_transporte: true });
  conferirValores(calcularFolhaFuncionario(linhas[0], COMPETENCIA_QA), {
    inss: 204.57, ir: 0, fgts: 203.45, base_ir: 1935.92, base_calculo: 2543.12,
    valor_horas_extras: 42.62, desconto_vt: 150.03, liquido: 2188.52,
  });
});

// Valores marginais exatos para (limite − 0,01, limite, limite + 0,01).
// A comparação usa a contribuição antes do arredondamento: no teto da
// Portaria MPS/MF nº 13/2026, os três valores monetários seriam R$ 988,09.
const bordasInss = [
  [1621, [121.57425, 121.575, 121.5759]],
  [2902.84, [236.9397, 236.9406, 236.9418]],
  [4354.27, [411.1110, 411.1122, 411.1136]],
  [8475.55, [988.0900, 988.0914, 988.0914]],
];

for (const [limite, contribuicoes] of bordasInss) {
  test(`INSS — Portaria MPS/MF nº 13/2026: limite de R$ ${limite} e centavos adjacentes`, () => {
    const { inss } = resolverTabelaFolha(COMPETENCIA_QA);
    for (const [indice, esperado] of contribuicoes.entries()) {
      const base = (Math.round(limite * 100) + indice - 1) / 100;
      const observado = calcularINSS(base, inss);
      assert.ok(Math.abs(observado - esperado) < 1e-9, `R$ ${base}: ${observado} ≠ ${esperado}`);
    }
  });
}

// Tabela mensal da Receita de 2026. Cada tripla contém o imposto devido com
// base de IRRF um centavo abaixo do limite, no limite e um centavo acima.
const bordasIrrf = [
  [2428.80, [0, 0, 0]],
  [2826.65, [29.84, 29.84, 29.84]],
  [3751.05, [168.50, 168.50, 168.50]],
  [4664.68, [374.06, 374.06, 374.06]],
];

test("IRRF — Receita Federal 2026: limites oficiais das faixas e da redução", () => {
  const { irrf } = resolverTabelaFolha(COMPETENCIA_QA);
  assert.deepEqual(irrf.faixas.map(({ limite }) => limite), [2428.80, 2826.65, 3751.05, 4664.68, Infinity]);
  const { isencaoAte, faseOutAte } = irrf.reducaoMensal;
  assert.deepEqual([isencaoAte, faseOutAte], [5000, 7350]);
});

for (const [limite, impostos] of bordasIrrf) {
  test(`IRRF — tabela mensal da Receita 2026: base de R$ ${limite} e centavos adjacentes`, () => {
    const { irrf } = resolverTabelaFolha(COMPETENCIA_QA);
    // Para isolar a tabela mensal, rendimento acima de R$ 7.350 e deduções
    // legais de R$ 6.107,0214 (INSS no teto + 27 dependentes fictícios).
    for (const [indice, esperado] of impostos.entries()) {
      const baseCalculo = (Math.round(limite * 100) + 610702 + indice - 1) / 100;
      const dados = { baseCalculo, inss: 988.0914, numDependentes: 27 };
      assert.equal(calcularIR(dados, irrf), esperado, `rendimento de R$ ${baseCalculo}`);
    }
  });
}

test("IRRF — Lei 15.270/2025: R$ 5.000 de isenção e R$ 7.350 de redutor, ± R$ 0,01", () => {
  // Dois dependentes no fim do redutor tornam visível o efeito do redutor
  // residual de R$ 0,00425 no imposto arredondado de R$ 7.350,00.
  const bordas = [
    [4999.99, 0, 0], [5000, 0, 0], [5000.01, 0, 0],
    [7349.99, 2, 779.85], [7350, 2, 779.85], [7350.01, 2, 779.86],
  ];
  for (const [salario_bruto, num_dependentes, esperado] of bordas) {
    const calculo = calcularFolhaFuncionario(linha({ salario_bruto, num_dependentes }), COMPETENCIA_QA);
    assert.equal(calculo.ir, esperado, `rendimento de R$ ${salario_bruto}`);
  }
});

const vigencias = [
  {
    competencias: ["2024-02", "2024-12"], origem: "Receita Federal 2024 e Portaria MPS/MF nº 2/2024",
    campos: { salario_bruto: 6000, num_dependentes: 1 },
    esperados: { inss: 658.82, base_ir: 5151.59, ir: 520.69, liquido: 4820.49 },
  },
  {
    competencias: ["2025-01", "2025-03", "2025-04"],
    origem: `Receita Federal 2025, Portaria MPS/MF nº 6/2025 (${ORIGEM_QA}, lote E em 2025-03)`,
    campos: { salario_bruto: 3000 },
    esperados: { inss: 253.41, base_ir: 2435.20, ir: 13.20, liquido: 2733.39 },
  },
  {
    competencias: ["2025-05", "2025-12"], origem: "Receita Federal 2025 e Portaria MPS/MF nº 6/2025",
    campos: { salario_bruto: 3000 },
    esperados: { inss: 253.41, base_ir: 2392.80, ir: 0, liquido: 2746.59 },
  },
  {
    competencias: ["2026-01", "2026-12"], origem: "Receita Federal 2026 e Portaria MPS/MF nº 13/2026",
    campos: { salario_bruto: 5000 },
    esperados: { inss: 501.51, base_ir: 4392.80, ir: 0, liquido: 4498.49 },
  },
];

for (const { competencias, origem, campos, esperados } of vigencias) {
  for (const competencia of competencias) {
    test(`Folha de ${competencia} — ${origem}`, () => {
      conferirValores(calcularFolhaFuncionario(linha(campos), competencia), esperados);
    });
  }
}

test("IRRF — Receita Federal 2024: janeiro usa a dedução de R$ 884,96 na última faixa",
  { skip: "BUG (vigência IRRF 2024)" }, () => {
    const calculo = calcularFolhaFuncionario(linha({ salario_bruto: 6000 }), "2024-01");
    conferirValores(calculo, { inss: 658.82, base_ir: 5341.18, ir: 583.86, liquido: 4757.32 });
  });

test("IRRF — Receita Federal 2024: junho usa a dedução simplificada mais vantajosa de R$ 564,80",
  { skip: "BUG (dedução simplificada IRRF 2024)" }, () => {
    const calculo = calcularFolhaFuncionario(linha({ salario_bruto: 2700 }), "2024-06");
    conferirValores(calculo, { inss: 222.82, base_ir: 2135.20, ir: 0, liquido: 2477.18 });
  });

function calcularLoteVictor() {
  return lote.slice(0, 5).map(([funcionario, campos]) => (
    calcularFolhaFuncionario(linha({ funcionario, ...campos }), COMPETENCIA_QA)
  ));
}

test(`${ORIGEM_QA}, lote oficial de Ana a Elisa — líquido de R$ 19.558,70`, () => {
  const totais = calcularTotaisEmpresa(calcularLoteVictor());
  conferirValores(totais, { totalFuncionarios: 5, totalLiquido: 19558.70 });
});

test(`${ORIGEM_QA}, P7 — fechamento com proventos, descontos e FGTS separado`,
  { skip: "BUG (FOLHA-5) #745" }, () => {
    const totais = calcularTotaisEmpresa(calcularLoteVictor());
    // Ana a Elisa: proventos = salários + HE; descontos = faltas + INSS +
    // IRRF + adiantamento + VT. A soma dos FGTS é do empregador.
    conferirValores(totais, {
      totalProventos: 24825.55, totalDescontos: 5266.85, totalFgts: 1970.04, totalLiquido: 19558.70,
    });
    const saldoEmCentavos = Math.round(totais.totalProventos * 100) - Math.round(totais.totalDescontos * 100);
    assert.equal(saldoEmCentavos, Math.round(totais.totalLiquido * 100));
  });

test(`${ORIGEM_QA}, lote C — rejeita salário de R$ 2.000 com 31 faltas em 30 dias`,
  { skip: "BUG (FOLHA-4) #744" }, async () => {
    const { linhas, erros } = await lerLinhaExcel({ salario_bruto: 2000, faltas: 31 });
    assert.deepEqual(linhas, []);
    assert.equal(erros.length, 1);
    assert.equal(erros[0].linha, 2);
    assert.match(erros[0].motivos.join(" "), /faltas.*dias_trabalhados/);
  });

test(`${ORIGEM_QA}, lote C — rejeita adiantamento de R$ 5.000 sobre salário de R$ 2.000`,
  { skip: "BUG (FOLHA-4) #744" }, () => {
    // O validador do lote é introduzido pela FOLHA-4 (#754).
    const { calcularFolhaLinhas } = folha;
    assert.equal(typeof calcularFolhaLinhas, "function", "validação do líquido por linha");
    const entrada = linha({ linha: 2, salario_bruto: 2000, adiantamento: 5000 });
    const { calculos, erros } = calcularFolhaLinhas([entrada], COMPETENCIA_QA);
    assert.deepEqual(calculos, []);
    assert.equal(erros.length, 1);
    assert.equal(erros[0].linha, 2);
    assert.match(erros[0].motivos.join(" "), /adiantamento.*maior que o líquido/);
  });
