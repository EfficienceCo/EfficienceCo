/**
 * FOLHA-5 (#745) — relatório de fechamento que fecha, holerite com formato pt-BR e CNPJ do
 * empregador, mensagem no singular. Valores esperados conferidos à mão neste arquivo.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  COLUNAS_FOLHA,
  COLUNA_CNPJ,
  calcularFolhaFuncionario,
  calcularTotaisEmpresa,
  formatarDecimalBR,
  formatarReferencia,
  gerarHoleritePDF,
  gerarRelatorioFechamentoPDF,
  gerarTemplateFolha,
  lerLinhasPlanilha,
  mascararCnpj,
  mascararCpf,
  resolverCnpjsEmpresas,
} from "../src/services/folha.service.js";
import { montarDescricaoConclusao } from "../src/services/folha-status.helpers.js";

const COMPETENCIA = "2026-10-01";
const CNPJ_A = "11222333000181"; // DV válido
const CNPJ_B = "11444777000161"; // DV válido

describe("formatos pt-BR do holerite", () => {
  it("moeda com milhar e vírgula", () => {
    assert.equal(formatarDecimalBR(6000), "6.000,00");
    assert.equal(formatarDecimalBR(4167.75), "4.167,75");
    assert.equal(formatarDecimalBR(0), "0,00");
    assert.equal(formatarDecimalBR(1234567.891), "1.234.567,89");
  });
  it("CPF e CNPJ com máscara; valor que não tem o tamanho sai como veio", () => {
    assert.equal(mascararCpf("10003167690"), "100.031.676-90");
    assert.equal(mascararCpf("100.031.676-90"), "100.031.676-90");
    assert.equal(mascararCpf("123"), "123");
    assert.equal(mascararCnpj(CNPJ_A), "11.222.333/0001-81");
  });
  it("referência de hora extra com vírgula", () => {
    assert.equal(formatarReferencia(2.5), "2,5");
    assert.equal(formatarReferencia(5), "5");
  });
  it("holerite e relatório geram PDF com e sem CNPJ", async () => {
    const calculo = calcularFolhaFuncionario({
      empresa: "Alfa", funcionario: "Diego", cpf: "10003167690", cargo: "Analista",
      salario_bruto: 6000, dias_trabalhados: 30, horas_extras: 5, faltas: 1, adiantamento: 0,
      num_dependentes: 0, vale_transporte: false, categoria: "empregado", cnpj_empresa: CNPJ_A,
    }, COMPETENCIA);
    for (const cnpj of [CNPJ_A, null]) {
      const holerite = await gerarHoleritePDF({ ...calculo, cnpj_empresa: cnpj }, "10/2026");
      assert.equal(holerite.subarray(0, 4).toString(), "%PDF");
      const relatorio = await gerarRelatorioFechamentoPDF({
        empresa: "Alfa", cnpjEmpresa: cnpj, mesReferenciaFormatado: "10/2026",
        calculos: [calculo], totais: calcularTotaisEmpresa([calculo]),
      });
      assert.equal(relatorio.subarray(0, 4).toString(), "%PDF");
    }
  });
});

describe("mensagem de conclusão no singular e no plural", () => {
  it("1 funcionário e 1 empresa", () => {
    assert.equal(montarDescricaoConclusao(1, 1), "Folha processada — 1 funcionário, 1 empresa");
  });
  it("plural quando passa de 1 (inclui o caso 15 funcionários e 2 empresas do QA)", () => {
    assert.equal(montarDescricaoConclusao(15, 2), "Folha processada — 15 funcionários, 2 empresas");
    assert.equal(montarDescricaoConclusao(1, 2), "Folha processada — 1 funcionário, 2 empresas");
  });
});

describe("totais do relatório de fechamento fecham entre si", () => {
  const linhaDiego = {
    empresa: "Alfa", funcionario: "Diego", cpf: "10003167690", cargo: "Analista",
    salario_bruto: 6000, dias_trabalhados: 30, horas_extras: 5, faltas: 1, adiantamento: 0,
    num_dependentes: 0, vale_transporte: false, categoria: "empregado",
  };

  it("caso do QA (6.000, 5 HE, 1 falta): proventos − descontos = líquido e FGTS fica fora", () => {
    const diego = calcularFolhaFuncionario(linhaDiego, COMPETENCIA);
    const t = calcularTotaisEmpresa([diego]);
    // 6000 + 5 h × (6000/220 × 1,5) = 6204,55; descontos = INSS + IRRF + falta (200,00)
    assert.equal(t.totalProventos, 6204.55);
    assert.equal(Math.round((t.totalProventos - t.totalDescontos) * 100), Math.round(t.totalLiquido * 100));
    assert.equal(t.totalFgts, diego.fgts);
    assert.ok(t.totalDescontos >= diego.valor_faltas + diego.inss + diego.ir - 0.001);
  });

  // Caso real do review do #760: o motor arredonda a base depois de combinar salário, falta e HE
  // (2.951,22), mas as rubricas somadas dariam 2.951,23. O fechamento tem que bater com o líquido gravado.
  it("subcentavo: salário 3.000,09, 2,5 HE e 1 falta → 3.051,23 − 342,76 = 2.708,47 (o líquido do holerite)", () => {
    const calculo = calcularFolhaFuncionario({
      ...linhaDiego, salario_bruto: 3000.09, horas_extras: 2.5, faltas: 1,
    }, COMPETENCIA);
    assert.equal(calculo.liquido, 2708.47);
    const t = calcularTotaisEmpresa([calculo]);
    assert.equal(formatarDecimalBR(t.totalProventos), "3.051,23");
    assert.equal(formatarDecimalBR(t.totalDescontos), "342,76");
    assert.equal(formatarDecimalBR(t.totalLiquido), "2.708,47");
    assert.equal(Math.round((t.totalProventos - t.totalDescontos) * 100), Math.round(t.totalLiquido * 100));
  });

  it("200 linhas variadas: cada linha fecha sozinha (diferenças de sinal oposto não se compensam no lote)", () => {
    let semente = 12345;
    const sorteio = (max) => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente % max; };
    const calculos = Array.from({ length: 200 }, (_, i) => calcularFolhaFuncionario({
      ...linhaDiego,
      funcionario: `F${i}`,
      salario_bruto: 1500 + sorteio(15000) + sorteio(100) / 100,
      horas_extras: sorteio(20) / 2,
      faltas: sorteio(4),
      adiantamento: sorteio(300),
      num_dependentes: sorteio(4),
      vale_transporte: sorteio(2) === 1,
    }, COMPETENCIA));
    for (const calculo of calculos) {
      const t = calcularTotaisEmpresa([calculo]);
      const diferenca = Math.round((t.totalProventos - t.totalDescontos) * 100) - Math.round(t.totalLiquido * 100);
      assert.equal(diferenca, 0, `${calculo.funcionario}: diferença de ${diferenca} centavos`);
    }
    const lote = calcularTotaisEmpresa(calculos);
    assert.equal(Math.round((lote.totalProventos - lote.totalDescontos) * 100), Math.round(lote.totalLiquido * 100));
  });

  it("FGTS não entra nos descontos do empregado (sem falta, HE, VT nem adiantamento: descontos = INSS + IRRF)", () => {
    const calculo = calcularFolhaFuncionario({ ...linhaDiego, horas_extras: 0, faltas: 0 }, COMPETENCIA);
    const t = calcularTotaisEmpresa([calculo]);
    assert.equal(t.totalFgts, 480); // 8% de 6.000,00
    assert.equal(t.totalDescontos, Math.round((calculo.inss + calculo.ir) * 100) / 100);
  });
});

describe("cnpj_empresa na planilha", () => {
  async function planilha(linhas, { comColunaCnpj = true } = {}) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Folha");
    ws.addRow([...COLUNAS_FOLHA.map((c) => c.header), ...(comColunaCnpj ? [COLUNA_CNPJ.header] : [])]);
    for (const l of linhas) {
      ws.addRow([...COLUNAS_FOLHA.map((c) => l[c.key]), ...(comColunaCnpj ? [l.cnpj_empresa] : [])]);
    }
    return Buffer.from(await wb.xlsx.writeBuffer());
  }
  const base = (n, extra = {}) => ({
    empresa: "Alfa Ltda", funcionario: `Func ${n}`, cpf: ["52998224725", "12345678909", "11144477735"][n],
    cargo: "Caixa", salario_bruto: 3000, dias_trabalhados: 30, horas_extras: 0, faltas: 0,
    adiantamento: 0, num_dependentes: 0, vale_transporte: false, ...extra,
  });

  it("CNPJ válido (com máscara) é guardado só com dígitos", async () => {
    const { linhas, erros } = await lerLinhasPlanilha(await planilha([base(0, { cnpj_empresa: "11.222.333/0001-81" })]));
    assert.deepEqual(erros, []);
    assert.equal(linhas[0].cnpj_empresa, CNPJ_A);
  });

  it("CNPJ com dígito verificador errado vira erro na linha", async () => {
    const { erros } = await lerLinhasPlanilha(await planilha([base(0, { cnpj_empresa: "11222333000182" })]));
    assert.equal(erros[0].linha, 2);
    assert.match(erros[0].motivos[0], /cnpj_empresa inválido/);
  });

  it("sem a coluna ou com a célula vazia: segue válida, sem CNPJ", async () => {
    const a = await lerLinhasPlanilha(await planilha([base(0)], { comColunaCnpj: false }));
    assert.deepEqual(a.erros, []);
    assert.equal(a.linhas[0].cnpj_empresa, null);
    const b = await lerLinhasPlanilha(await planilha([base(0)]));
    assert.equal(b.linhas[0].cnpj_empresa, null);
  });

  it("linha sem CNPJ herda o da mesma empresa", async () => {
    const { linhas } = await lerLinhasPlanilha(await planilha([
      base(0, { cnpj_empresa: CNPJ_A }), base(1, { empresa: "ALFA  ltda" }),
    ]));
    assert.equal(linhas[1].cnpj_empresa, CNPJ_A);
  });

  it("mesma empresa com dois CNPJs diferentes: erro", async () => {
    const { erros } = await lerLinhasPlanilha(await planilha([
      base(0, { cnpj_empresa: CNPJ_A }), base(1, { cnpj_empresa: CNPJ_B }),
    ]));
    assert.ok(erros.length >= 1);
    assert.match(erros[0].motivos[0], /mais de um cnpj_empresa/);
  });

  it("o cálculo leva o CNPJ para folha_calculos", async () => {
    const { linhas } = await lerLinhasPlanilha(await planilha([base(0, { cnpj_empresa: CNPJ_A })]));
    assert.equal(calcularFolhaFuncionario(linhas[0], COMPETENCIA).cnpj_empresa, CNPJ_A);
  });

  it("o modelo baixado tem a coluna cnpj_empresa e a lista de categoria fica na coluna de categoria", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await gerarTemplateFolha()));
    const ws = wb.worksheets[0];
    const cabecalho = ws.getRow(1).values.slice(1);
    assert.equal(cabecalho.at(-1), "cnpj_empresa");
    const colunaCategoria = cabecalho.indexOf("categoria") + 1;
    assert.match(ws.getRow(2).getCell(colunaCategoria).dataValidation.formulae[0], /EMPREGADO/);
    assert.equal(ws.getRow(2).getCell(cabecalho.length).dataValidation, undefined);
  });
});

describe("resolverCnpjsEmpresas", () => {
  const cliente = { nome: "Padaria Pão Quente Ltda", cnpj: CNPJ_B };

  it("o CNPJ da planilha vale mais que o do cadastro", () => {
    const m = resolverCnpjsEmpresas([{ empresa: "Alfa", cnpj_empresa: CNPJ_A }], cliente);
    assert.equal(m.get("Alfa"), CNPJ_A);
  });
  it("uma empresa só na planilha NÃO prova vínculo: nome diferente do cadastro fica sem CNPJ (nada de CNPJ da Alfa na Beta)", () => {
    const alfa = { nome: "Escritório Alfa", cnpj: CNPJ_A };
    const m = resolverCnpjsEmpresas([{ empresa: "Empregadora Beta", cnpj_empresa: null }], alfa);
    assert.equal(m.get("Empregadora Beta"), null);
  });
  it("uma empresa só, com o nome do cadastro (sem acento/caixa): usa o CNPJ do cadastro", () => {
    const m = resolverCnpjsEmpresas([{ empresa: "padaria pao quente ltda", cnpj_empresa: null }], cliente);
    assert.equal(m.get("padaria pao quente ltda"), CNPJ_B);
  });
  it("várias empresas: só a que tem o nome do cadastro (sem acento/caixa) usa o CNPJ dele", () => {
    const m = resolverCnpjsEmpresas([
      { empresa: "PADARIA PAO QUENTE LTDA", cnpj_empresa: null },
      { empresa: "Outra Empresa", cnpj_empresa: null },
    ], cliente);
    assert.equal(m.get("PADARIA PAO QUENTE LTDA"), CNPJ_B);
    assert.equal(m.get("Outra Empresa"), null);
  });
  it("sem CNPJ em lugar nenhum: null (o holerite sai sem CNPJ, sem inventar)", () => {
    const m = resolverCnpjsEmpresas([{ empresa: "Alfa", cnpj_empresa: null }], null);
    assert.equal(m.get("Alfa"), null);
  });
});
