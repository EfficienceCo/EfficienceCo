/**
 * BUG-FOLHA-03 — aptidão de validação da planilha de folha:
 * VT de domínio explícito, CPF com DV/normalização, unicidade e
 * all-or-nothing (sem linhas aceitas quando há qualquer erro).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  lerLinhasPlanilha,
  gerarTemplateFolha,
  COLUNAS_FOLHA,
} from "../src/services/folha.service.js";

const CPF_VALIDO_A = "529.982.247-25";
const CPF_VALIDO_A_DIGITOS = "52998224725";
const CPF_VALIDO_B = "123.456.789-09";
const CPF_VALIDO_B_DIGITOS = "12345678909";

const LINHA_BASE = {
  empresa: "Padaria do João",
  funcionario: "Maria Silva",
  cpf: CPF_VALIDO_A,
  cargo: "Caixa",
  salario_bruto: 3000,
  dias_trabalhados: 30,
  horas_extras: 0,
  faltas: 0,
  adiantamento: 0,
  num_dependentes: 0,
  vale_transporte: false,
};

async function criarBuffer(camposSobrescritos = {}) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Folha");
  ws.addRow(COLUNAS_FOLHA.map((c) => c.header));
  const dados = { ...LINHA_BASE, ...camposSobrescritos };
  ws.addRow(COLUNAS_FOLHA.map((c) => dados[c.key]));
  return wb.xlsx.writeBuffer();
}

async function criarBufferMultiplasLinhas(linhasCampos) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Folha");
  ws.addRow(COLUNAS_FOLHA.map((c) => c.header));
  for (const campos of linhasCampos) {
    const dados = { ...LINHA_BASE, ...campos };
    ws.addRow(COLUNAS_FOLHA.map((c) => dados[c.key]));
  }
  return wb.xlsx.writeBuffer();
}

function motivoContemAceitos(motivos) {
  const texto = motivos.join(" ").toLowerCase();
  assert.match(texto, /vale_transporte/);
  assert.ok(
    ["sim", "nao", "true", "false", "1", "0"].every((token) => texto.includes(token)),
    `motivo deve listar valores aceitos; recebido: ${JSON.stringify(motivos)}`,
  );
}

// ---------------------------------------------------------------------------
// Grupo A — Vale-transporte
// ---------------------------------------------------------------------------

describe("lerLinhasPlanilha — vale_transporte (domínio explícito)", () => {
  for (const valor of [true, "SIM", "sim", "VERDADEIRO", "TRUE", 1, "1"]) {
    it(`aceita true: ${JSON.stringify(valor)}`, async () => {
      const { linhas, erros } = await lerLinhasPlanilha(await criarBuffer({ vale_transporte: valor }));
      assert.equal(erros.length, 0, `erros: ${JSON.stringify(erros)}`);
      assert.equal(linhas[0].vale_transporte, true);
    });
  }

  for (const valor of [false, "NAO", "não", "FALSO", "FALSE", 0, "0"]) {
    it(`aceita false: ${JSON.stringify(valor)}`, async () => {
      const { linhas, erros } = await lerLinhasPlanilha(await criarBuffer({ vale_transporte: valor }));
      assert.equal(erros.length, 0, `erros: ${JSON.stringify(erros)}`);
      assert.equal(linhas[0].vale_transporte, false);
    });
  }

  it("fórmula com result true → true", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Folha");
    ws.addRow(COLUNAS_FOLHA.map((c) => c.header));
    const r = ws.addRow(COLUNAS_FOLHA.map((c) => LINHA_BASE[c.key]));
    const colIdx = COLUNAS_FOLHA.findIndex((c) => c.key === "vale_transporte") + 1;
    r.getCell(colIdx).value = { formula: "=TRUE()", result: true };
    const { linhas, erros } = await lerLinhasPlanilha(await wb.xlsx.writeBuffer());
    assert.equal(erros.length, 0);
    assert.equal(linhas[0].vale_transporte, true);
  });

  it("fórmula com result 'SIM' → true", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Folha");
    ws.addRow(COLUNAS_FOLHA.map((c) => c.header));
    const r = ws.addRow(COLUNAS_FOLHA.map((c) => LINHA_BASE[c.key]));
    const colIdx = COLUNAS_FOLHA.findIndex((c) => c.key === "vale_transporte") + 1;
    r.getCell(colIdx).value = { formula: '=UPPER("sim")', result: "SIM" };
    const { linhas, erros } = await lerLinhasPlanilha(await wb.xlsx.writeBuffer());
    assert.equal(erros.length, 0, `erros: ${JSON.stringify(erros)}`);
    assert.equal(linhas[0].vale_transporte, true);
  });

  it("fórmula com result false → false", async () => {
    // ExcelJS omite result boolean false no round-trip XLSX (mesmo problema do 0);
    // cobre o desembrulho com result string "FALSE", que sobrevive ao write/load.
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Folha");
    ws.addRow(COLUNAS_FOLHA.map((c) => c.header));
    const r = ws.addRow(COLUNAS_FOLHA.map((c) => LINHA_BASE[c.key]));
    const colIdx = COLUNAS_FOLHA.findIndex((c) => c.key === "vale_transporte") + 1;
    r.getCell(colIdx).value = { formula: '=UPPER("false")', result: "FALSE" };
    const { linhas, erros } = await lerLinhasPlanilha(await wb.xlsx.writeBuffer());
    assert.equal(erros.length, 0, `erros: ${JSON.stringify(erros)}`);
    assert.equal(linhas[0].vale_transporte, false);
  });

  for (const valor of ["SIMM", 264, 2, "", "xyz"]) {
    it(`rejeita valor não reconhecido: ${JSON.stringify(valor)}`, async () => {
      const { linhas, erros } = await lerLinhasPlanilha(await criarBuffer({ vale_transporte: valor }));
      assert.equal(linhas.length, 0);
      assert.ok(erros.length > 0);
      motivoContemAceitos(erros[0].motivos);
    });
  }

  it("célula vazia (null) rejeita e lista aceitos", async () => {
    const { linhas, erros } = await lerLinhasPlanilha(await criarBuffer({ vale_transporte: null }));
    assert.equal(linhas.length, 0);
    assert.ok(erros.length > 0);
    motivoContemAceitos(erros[0].motivos);
  });

  it("número 264 (caso QA) não vira false mudo", async () => {
    const { linhas, erros } = await lerLinhasPlanilha(await criarBuffer({ vale_transporte: 264 }));
    assert.equal(linhas.length, 0);
    assert.ok(erros.length > 0);
    assert.ok(erros[0].motivos.some((m) => m.includes("vale_transporte")));
  });
});

// ---------------------------------------------------------------------------
// Grupo B — CPF
// ---------------------------------------------------------------------------

describe("lerLinhasPlanilha — CPF (normalização e DV)", () => {
  it("aceita CPF com máscara e grava só dígitos", async () => {
    const { linhas, erros } = await lerLinhasPlanilha(await criarBuffer({ cpf: CPF_VALIDO_A }));
    assert.equal(erros.length, 0, `erros: ${JSON.stringify(erros)}`);
    assert.equal(linhas[0].cpf, CPF_VALIDO_A_DIGITOS);
  });

  it("aceita CPF sem máscara", async () => {
    const { linhas, erros } = await lerLinhasPlanilha(
      await criarBuffer({ cpf: CPF_VALIDO_A_DIGITOS }),
    );
    assert.equal(erros.length, 0);
    assert.equal(linhas[0].cpf, CPF_VALIDO_A_DIGITOS);
  });

  it("rejeita texto CPF-INVALIDO", async () => {
    const { linhas, erros } = await lerLinhasPlanilha(await criarBuffer({ cpf: "CPF-INVALIDO" }));
    assert.equal(linhas.length, 0);
    assert.ok(erros.some((e) => e.motivos.some((m) => /cpf/i.test(m))));
  });

  it("rejeita CPF com dígito verificador errado", async () => {
    const { linhas, erros } = await lerLinhasPlanilha(await criarBuffer({ cpf: "123.456.789-00" }));
    assert.equal(linhas.length, 0);
    assert.ok(erros.some((e) => e.motivos.some((m) => /cpf/i.test(m))));
  });

  it("rejeita sequência repetida 111.111.111-11", async () => {
    const { linhas, erros } = await lerLinhasPlanilha(await criarBuffer({ cpf: "111.111.111-11" }));
    assert.equal(linhas.length, 0);
    assert.ok(erros.some((e) => e.motivos.some((m) => /cpf/i.test(m))));
  });

  it("rejeita CPF vazio", async () => {
    const { linhas, erros } = await lerLinhasPlanilha(await criarBuffer({ cpf: "" }));
    assert.equal(linhas.length, 0);
    assert.ok(erros.some((e) => e.motivos.some((m) => /cpf/i.test(m))));
  });

  it("CPF como number Excel com 11 dígitos válidos é aceito", async () => {
    // 52998224725 cabe em Number sem perda de precisão
    const { linhas, erros } = await lerLinhasPlanilha(
      await criarBuffer({ cpf: Number(CPF_VALIDO_A_DIGITOS) }),
    );
    assert.equal(erros.length, 0, `erros: ${JSON.stringify(erros)}`);
    assert.equal(linhas[0].cpf, CPF_VALIDO_A_DIGITOS);
  });
});

// ---------------------------------------------------------------------------
// Grupo C — Unicidade de CPF
// ---------------------------------------------------------------------------

describe("lerLinhasPlanilha — unicidade de CPF", () => {
  it("duas linhas com o mesmo CPF mascarado: ambas em erros, nenhuma em linhas", async () => {
    const buf = await criarBufferMultiplasLinhas([
      { funcionario: "Ana", cpf: CPF_VALIDO_A },
      { funcionario: "Bruno", cpf: CPF_VALIDO_A },
    ]);
    const { linhas, erros } = await lerLinhasPlanilha(buf);
    assert.equal(linhas.length, 0);
    assert.equal(erros.length, 2);
    const linhasErro = erros.map((e) => e.linha).sort((a, b) => a - b);
    assert.deepEqual(linhasErro, [2, 3]);
    for (const erro of erros) {
      const texto = erro.motivos.join(" ");
      assert.match(texto, /duplicad/i);
      assert.ok(texto.includes("2") && texto.includes("3"), `deve citar linhas 2 e 3: ${texto}`);
    }
  });

  it("máscara vs puro contam como o mesmo CPF", async () => {
    const buf = await criarBufferMultiplasLinhas([
      { funcionario: "Ana", cpf: CPF_VALIDO_A },
      { funcionario: "Bruno", cpf: CPF_VALIDO_A_DIGITOS },
    ]);
    const { linhas, erros } = await lerLinhasPlanilha(buf);
    assert.equal(linhas.length, 0);
    assert.equal(erros.length, 2);
    for (const erro of erros) {
      assert.ok(erro.motivos.some((m) => /duplicad/i.test(m)));
    }
  });

  it("três linhas com A=B≠C: duplicatas + all-or-nothing zera linhas", async () => {
    const buf = await criarBufferMultiplasLinhas([
      { funcionario: "Ana", cpf: CPF_VALIDO_A },
      { funcionario: "Bruno", cpf: CPF_VALIDO_A },
      { funcionario: "Carla", cpf: CPF_VALIDO_B },
    ]);
    const { linhas, erros } = await lerLinhasPlanilha(buf);
    assert.equal(linhas.length, 0);
    assert.ok(erros.length >= 2);
    const comDuplicata = erros.filter((e) => e.motivos.some((m) => /duplicad/i.test(m)));
    assert.equal(comDuplicata.length, 2);
    assert.deepEqual(
      comDuplicata.map((e) => e.linha).sort((a, b) => a - b),
      [2, 3],
    );
  });

  it("dois CPFs distintos válidos são aceitos", async () => {
    const buf = await criarBufferMultiplasLinhas([
      { funcionario: "Ana", cpf: CPF_VALIDO_A },
      { funcionario: "Bruno", cpf: CPF_VALIDO_B },
    ]);
    const { linhas, erros } = await lerLinhasPlanilha(buf);
    assert.equal(erros.length, 0);
    assert.equal(linhas.length, 2);
    assert.equal(linhas[0].cpf, CPF_VALIDO_A_DIGITOS);
    assert.equal(linhas[1].cpf, CPF_VALIDO_B_DIGITOS);
  });
});

// ---------------------------------------------------------------------------
// Grupo D — Sem persistência parcial
// ---------------------------------------------------------------------------

describe("lerLinhasPlanilha — sem persistência parcial", () => {
  it("1 OK + 1 SIMM → erros e linhas vazias", async () => {
    const buf = await criarBufferMultiplasLinhas([
      { funcionario: "Ana", cpf: CPF_VALIDO_A, vale_transporte: "SIM" },
      { funcionario: "Bruno", cpf: CPF_VALIDO_B, vale_transporte: "SIMM" },
    ]);
    const { linhas, erros } = await lerLinhasPlanilha(buf);
    assert.ok(erros.length >= 1);
    assert.equal(linhas.length, 0);
  });

  it("1 OK + 1 CPF inválido → erros e linhas vazias", async () => {
    const buf = await criarBufferMultiplasLinhas([
      { funcionario: "Ana", cpf: CPF_VALIDO_A },
      { funcionario: "Bruno", cpf: "CPF-INVALIDO" },
    ]);
    const { linhas, erros } = await lerLinhasPlanilha(buf);
    assert.ok(erros.length >= 1);
    assert.equal(linhas.length, 0);
  });

  it("duplicata → linhas.length === 0", async () => {
    const buf = await criarBufferMultiplasLinhas([
      { funcionario: "Ana", cpf: CPF_VALIDO_A },
      { funcionario: "Bruno", cpf: CPF_VALIDO_A },
    ]);
    const { linhas, erros } = await lerLinhasPlanilha(buf);
    assert.ok(erros.length >= 1);
    assert.equal(linhas.length, 0);
  });

  it("planilha 100% válida devolve todas as linhas", async () => {
    const buf = await criarBufferMultiplasLinhas([
      { funcionario: "Ana", cpf: CPF_VALIDO_A, vale_transporte: true },
      { funcionario: "Bruno", cpf: CPF_VALIDO_B, vale_transporte: "NAO" },
    ]);
    const { linhas, erros } = await lerLinhasPlanilha(buf);
    assert.equal(erros.length, 0);
    assert.equal(linhas.length, 2);
  });
});

// ---------------------------------------------------------------------------
// Grupo E — Template
// ---------------------------------------------------------------------------

describe("gerarTemplateFolha — restrição de vale_transporte", () => {
  it("coluna vale_transporte tem dataValidation lista SIM,NAO nas linhas de dado", async () => {
    const buffer = await gerarTemplateFolha();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const sheet = wb.worksheets[0];
    const colIdx = COLUNAS_FOLHA.findIndex((c) => c.key === "vale_transporte") + 1;

    const cell = sheet.getRow(2).getCell(colIdx);
    const dv = cell.dataValidation;
    assert.ok(dv, "dataValidation deve existir na célula de dado de vale_transporte");
    assert.equal(dv.type, "list");
    const formulae = Array.isArray(dv.formulae) ? dv.formulae.join(",") : String(dv.formulae ?? "");
    assert.match(formulae.toUpperCase(), /SIM/);
    assert.match(formulae.toUpperCase(), /NAO/);
  });
});
