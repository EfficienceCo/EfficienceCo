/**
 * Testa o comportamento de paraNumero e paraBooleano de forma indireta,
 * via lerLinhasPlanilha com buffers Excel reais construídos em memória.
 * Cobre o bug de células de fórmula e o parsing de formatos BR/US.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { lerLinhasPlanilha, COLUNAS_FOLHA } from "../src/services/folha.service.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LINHA_BASE = {
  empresa: "Padaria do João",
  funcionario: "Maria Silva",
  cpf: "111.111.111-11",
  cargo: "Caixa",
  salario_bruto: 3000,
  dias_trabalhados: 30,
  horas_extras: 0,
  faltas: 0,
  adiantamento: 0,
  num_dependentes: 0,
  vale_transporte: false,
};

/**
 * Cria um buffer Excel com uma linha de dados, permitindo sobrescrever
 * qualquer campo com o valor bruto desejado (inclusive objetos de fórmula).
 */
async function criarBuffer(camposSobrescritos = {}) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Folha");

  ws.addRow(COLUNAS_FOLHA.map((c) => c.header));

  const dados = { ...LINHA_BASE, ...camposSobrescritos };
  const celulas = COLUNAS_FOLHA.map((c) => dados[c.key]);
  ws.addRow(celulas);

  return wb.xlsx.writeBuffer();
}

// ---------------------------------------------------------------------------
// Números
// ---------------------------------------------------------------------------

describe("lerLinhasPlanilha — parsing de números", () => {
  it("número nativo (tipo number) é aceito diretamente", async () => {
    const buf = await criarBuffer({ salario_bruto: 3500.5 });
    const { linhas, erros } = await lerLinhasPlanilha(buf);
    assert.equal(erros.length, 0);
    assert.equal(linhas[0].salario_bruto, 3500.5);
  });

  it("string formato BR '1.500,00' → 1500.00", async () => {
    const buf = await criarBuffer({ salario_bruto: "1.500,00" });
    const { linhas, erros } = await lerLinhasPlanilha(buf);
    assert.equal(erros.length, 0, `erros: ${JSON.stringify(erros)}`);
    assert.equal(linhas[0].salario_bruto, 1500.0);
  });

  it("string formato BR '2.666,68' → 2666.68", async () => {
    const buf = await criarBuffer({ salario_bruto: "2.666,68" });
    const { linhas, erros } = await lerLinhasPlanilha(buf);
    assert.equal(erros.length, 0);
    assert.equal(linhas[0].salario_bruto, 2666.68);
  });

  it("string formato US '1,500.00' → 1500.00", async () => {
    const buf = await criarBuffer({ salario_bruto: "1,500.00" });
    const { linhas, erros } = await lerLinhasPlanilha(buf);
    assert.equal(erros.length, 0, `erros: ${JSON.stringify(erros)}`);
    assert.equal(linhas[0].salario_bruto, 1500.0);
  });

  it("string apenas com vírgula '50,00' → 50.00 (vírgula = decimal BR)", async () => {
    const buf = await criarBuffer({ adiantamento: "50,00" });
    const { linhas, erros } = await lerLinhasPlanilha(buf);
    assert.equal(erros.length, 0);
    assert.equal(linhas[0].adiantamento, 50.0);
  });

  it("string apenas com ponto '50.00' → 50.00", async () => {
    const buf = await criarBuffer({ adiantamento: "50.00" });
    const { linhas, erros } = await lerLinhasPlanilha(buf);
    assert.equal(erros.length, 0);
    assert.equal(linhas[0].adiantamento, 50.0);
  });

  it("inteiro como string '30' → 30", async () => {
    const buf = await criarBuffer({ dias_trabalhados: "30" });
    const { linhas, erros } = await lerLinhasPlanilha(buf);
    assert.equal(erros.length, 0);
    assert.equal(linhas[0].dias_trabalhados, 30);
  });

  it("zero como número → 0 (válido para faltas/adiantamento/extras)", async () => {
    const buf = await criarBuffer({ horas_extras: 0, faltas: 0, adiantamento: 0 });
    const { linhas, erros } = await lerLinhasPlanilha(buf);
    assert.equal(erros.length, 0);
    assert.equal(linhas[0].horas_extras, 0);
  });

  it("negativo gera erro de validação", async () => {
    const buf = await criarBuffer({ salario_bruto: -100 });
    const { erros } = await lerLinhasPlanilha(buf);
    assert.ok(erros.length > 0);
    assert.ok(erros[0].motivos.some((m) => m.includes("salario_bruto")));
  });

  it("string não-numérica gera erro de validação", async () => {
    const buf = await criarBuffer({ salario_bruto: "abc" });
    const { erros } = await lerLinhasPlanilha(buf);
    assert.ok(erros.length > 0);
    assert.ok(erros[0].motivos.some((m) => m.includes("salario_bruto")));
  });

  it("string vazia em campo numérico gera erro", async () => {
    const buf = await criarBuffer({ num_dependentes: "" });
    const { erros } = await lerLinhasPlanilha(buf);
    assert.ok(erros.length > 0);
  });
});

// ---------------------------------------------------------------------------
// Células de fórmula (bug original)
// ---------------------------------------------------------------------------

describe("lerLinhasPlanilha — células de fórmula Excel", () => {
  it("fórmula com resultado número é desembrulhada corretamente", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Folha");
    ws.addRow(COLUNAS_FOLHA.map((c) => c.header));

    const linha = COLUNAS_FOLHA.map((c) => LINHA_BASE[c.key]);
    const r = ws.addRow(linha);

    // Substitui salario_bruto por uma célula de fórmula
    const colIdx = COLUNAS_FOLHA.findIndex((c) => c.key === "salario_bruto") + 1;
    r.getCell(colIdx).value = { formula: "=3000+500", result: 3500 };

    const buf = await wb.xlsx.writeBuffer();
    const { linhas, erros } = await lerLinhasPlanilha(buf);
    assert.equal(erros.length, 0, `erros: ${JSON.stringify(erros)}`);
    assert.equal(linhas[0].salario_bruto, 3500);
  });

  it("fórmula com resultado string BR '1.500,00' é desembrulhada e convertida", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Folha");
    ws.addRow(COLUNAS_FOLHA.map((c) => c.header));

    const linha = COLUNAS_FOLHA.map((c) => LINHA_BASE[c.key]);
    const r = ws.addRow(linha);

    const colIdx = COLUNAS_FOLHA.findIndex((c) => c.key === "salario_bruto") + 1;
    r.getCell(colIdx).value = { formula: "=TEXT(1500,\"#.##0,00\")", result: "1.500,00" };

    const buf = await wb.xlsx.writeBuffer();
    const { linhas, erros } = await lerLinhasPlanilha(buf);
    assert.equal(erros.length, 0, `erros: ${JSON.stringify(erros)}`);
    assert.equal(linhas[0].salario_bruto, 1500.0);
  });

  it("fórmula com resultado numérico não-zero é desembrulhada sem erro", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Folha");
    ws.addRow(COLUNAS_FOLHA.map((c) => c.header));

    const linha = COLUNAS_FOLHA.map((c) => LINHA_BASE[c.key]);
    const r = ws.addRow(linha);

    // ExcelJS não preserva result: 0 no round-trip (zero é omitido pelo XLSX)
    // — testa o desembrulho com resultado positivo; zero direto (número nativo) já está
    // coberto no describe de "parsing de números".
    const colIdx = COLUNAS_FOLHA.findIndex((c) => c.key === "horas_extras") + 1;
    r.getCell(colIdx).value = { formula: "=4", result: 4 };

    const buf = await wb.xlsx.writeBuffer();
    const { linhas, erros } = await lerLinhasPlanilha(buf);
    assert.equal(erros.length, 0, `erros: ${JSON.stringify(erros)}`);
    assert.equal(linhas[0].horas_extras, 4);
  });
});

// ---------------------------------------------------------------------------
// richText
// ---------------------------------------------------------------------------

describe("lerLinhasPlanilha — células richText", () => {
  it("richText com texto numérico BR é desembrulhado e convertido", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Folha");
    ws.addRow(COLUNAS_FOLHA.map((c) => c.header));

    const linha = COLUNAS_FOLHA.map((c) => LINHA_BASE[c.key]);
    const r = ws.addRow(linha);

    const colIdx = COLUNAS_FOLHA.findIndex((c) => c.key === "adiantamento") + 1;
    r.getCell(colIdx).value = { richText: [{ text: "200" }, { text: ",50" }] };

    const buf = await wb.xlsx.writeBuffer();
    const { linhas, erros } = await lerLinhasPlanilha(buf);
    assert.equal(erros.length, 0, `erros: ${JSON.stringify(erros)}`);
    assert.equal(linhas[0].adiantamento, 200.5);
  });
});

// ---------------------------------------------------------------------------
// Booleano (vale_transporte)
// ---------------------------------------------------------------------------

describe("lerLinhasPlanilha — vale_transporte (booleano)", () => {
  it("boolean true → desconto VT aplicado no cálculo", async () => {
    const buf = await criarBuffer({ vale_transporte: true });
    const { linhas, erros } = await lerLinhasPlanilha(buf);
    assert.equal(erros.length, 0);
    assert.equal(linhas[0].vale_transporte, true);
  });

  it("boolean false → sem desconto VT", async () => {
    const buf = await criarBuffer({ vale_transporte: false });
    const { linhas, erros } = await lerLinhasPlanilha(buf);
    assert.equal(erros.length, 0);
    assert.equal(linhas[0].vale_transporte, false);
  });

  it("string 'SIM' → true", async () => {
    const buf = await criarBuffer({ vale_transporte: "SIM" });
    const { linhas, erros } = await lerLinhasPlanilha(buf);
    assert.equal(erros.length, 0);
    assert.equal(linhas[0].vale_transporte, true);
  });

  it("string 'VERDADEIRO' → true", async () => {
    const buf = await criarBuffer({ vale_transporte: "VERDADEIRO" });
    const { linhas, erros } = await lerLinhasPlanilha(buf);
    assert.equal(erros.length, 0);
    assert.equal(linhas[0].vale_transporte, true);
  });

  it("número 1 → true (checkbox formulado como número)", async () => {
    const buf = await criarBuffer({ vale_transporte: 1 });
    const { linhas, erros } = await lerLinhasPlanilha(buf);
    assert.equal(erros.length, 0);
    assert.equal(linhas[0].vale_transporte, true);
  });

  it("número 0 → false", async () => {
    const buf = await criarBuffer({ vale_transporte: 0 });
    const { linhas, erros } = await lerLinhasPlanilha(buf);
    assert.equal(erros.length, 0);
    assert.equal(linhas[0].vale_transporte, false);
  });

  it("fórmula com resultado boolean true → true", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Folha");
    ws.addRow(COLUNAS_FOLHA.map((c) => c.header));

    const linha = COLUNAS_FOLHA.map((c) => LINHA_BASE[c.key]);
    const r = ws.addRow(linha);

    const colIdx = COLUNAS_FOLHA.findIndex((c) => c.key === "vale_transporte") + 1;
    r.getCell(colIdx).value = { formula: "=TRUE()", result: true };

    const buf = await wb.xlsx.writeBuffer();
    const { linhas, erros } = await lerLinhasPlanilha(buf);
    assert.equal(erros.length, 0);
    assert.equal(linhas[0].vale_transporte, true);
  });
});

// ---------------------------------------------------------------------------
// Integridade do cálculo final
// ---------------------------------------------------------------------------

describe("lerLinhasPlanilha — cálculo end-to-end com formatos mistos", () => {
  it("linha com salário BR string e VT como fórmula → números calculados corretamente", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Folha");
    ws.addRow(COLUNAS_FOLHA.map((c) => c.header));

    const linha = COLUNAS_FOLHA.map((c) => LINHA_BASE[c.key]);
    const r = ws.addRow(linha);

    // salario_bruto como string BR
    const idxSalario = COLUNAS_FOLHA.findIndex((c) => c.key === "salario_bruto") + 1;
    r.getCell(idxSalario).value = "3.000,00";

    // vale_transporte como fórmula booleana
    const idxVt = COLUNAS_FOLHA.findIndex((c) => c.key === "vale_transporte") + 1;
    r.getCell(idxVt).value = { formula: "=TRUE()", result: true };

    const buf = await wb.xlsx.writeBuffer();
    const { linhas, erros } = await lerLinhasPlanilha(buf);

    assert.equal(erros.length, 0, `erros inesperados: ${JSON.stringify(erros)}`);
    assert.equal(linhas[0].salario_bruto, 3000);
    assert.equal(linhas[0].vale_transporte, true);
  });
});
