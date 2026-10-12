// BUG-APUR-12 (#612) — coluna opcional "categoria" na planilha de folha:
// SOCIO marca pró-labore, que compõe a FS12 do Fator R mas não tem FGTS.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  lerLinhasPlanilha,
  gerarTemplateFolha,
  validarColunasPlanilha,
  calcularFolhaFuncionario,
  montarCelulasBases,
  COLUNAS_FOLHA,
  COLUNA_CATEGORIA,
} from "../src/services/folha.service.js";

const LINHA_BASE = {
  empresa: "Escritório Teste",
  funcionario: "Ana Sócia",
  cpf: "529.982.247-25",
  cargo: "Sócia-administradora",
  salario_bruto: 3400,
  dias_trabalhados: 30,
  horas_extras: 0,
  faltas: 0,
  adiantamento: 0,
  num_dependentes: 0,
  vale_transporte: false,
};

async function criarBuffer({ comCategoria, categoria } = {}) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Folha");
  const colunas = comCategoria ? [...COLUNAS_FOLHA, COLUNA_CATEGORIA] : COLUNAS_FOLHA;
  ws.addRow(colunas.map((c) => c.header));
  const dados = { ...LINHA_BASE, categoria };
  ws.addRow(colunas.map((c) => dados[c.key]));
  return wb.xlsx.writeBuffer();
}

describe("lerLinhasPlanilha — categoria (opcional)", () => {
  it("planilha antiga, sem a coluna, continua válida e trata a linha como empregado", async () => {
    const buffer = await criarBuffer();
    assert.equal((await validarColunasPlanilha(buffer)).valido, true);
    const { linhas, erros } = await lerLinhasPlanilha(buffer);
    assert.deepEqual(erros, []);
    assert.equal(linhas[0].categoria, "empregado");
  });

  it("célula vazia = empregado", async () => {
    const { linhas, erros } = await lerLinhasPlanilha(await criarBuffer({ comCategoria: true, categoria: null }));
    assert.deepEqual(erros, []);
    assert.equal(linhas[0].categoria, "empregado");
  });

  for (const texto of ["SOCIO", "Sócio", " socio "]) {
    it(`"${texto}" = socio`, async () => {
      const { linhas, erros } = await lerLinhasPlanilha(await criarBuffer({ comCategoria: true, categoria: texto }));
      assert.deepEqual(erros, []);
      assert.equal(linhas[0].categoria, "socio");
    });
  }

  it("valor fora do domínio vira erro da linha (sem persistência parcial)", async () => {
    const { linhas, erros } = await lerLinhasPlanilha(await criarBuffer({ comCategoria: true, categoria: "estagiario" }));
    assert.deepEqual(linhas, []);
    assert.equal(erros[0].linha, 2);
    assert.match(erros[0].motivos.join(" "), /categoria inválida.*EMPREGADO.*SOCIO/);
  });
});

describe("calcularFolhaFuncionario — pró-labore de sócio", () => {
  it("sócio: remuneração integral na base, FGTS zero", () => {
    const calculo = calcularFolhaFuncionario({ ...LINHA_BASE, categoria: "socio" }, "2026-08");
    assert.equal(calculo.base_calculo, 3400);
    assert.equal(calculo.fgts, 0);
  });

  it("empregado (ou linha sem categoria): FGTS 8% sobre a base", () => {
    assert.equal(calcularFolhaFuncionario({ ...LINHA_BASE, salario_bruto: 5000, categoria: "empregado" }, "2026-08").fgts, 400);
    assert.equal(calcularFolhaFuncionario({ ...LINHA_BASE, salario_bruto: 5000 }, "2026-08").fgts, 400);
  });

  it("não devolve categoria (folha_calculos não tem a coluna — o insert não pode quebrar)", () => {
    const calculo = calcularFolhaFuncionario({ ...LINHA_BASE, categoria: "socio" }, "2026-08");
    assert.equal("categoria" in calculo, false);
  });

  it("holerite do sócio mostra BASE FGTS 0,00", () => {
    const calculo = calcularFolhaFuncionario({ ...LINHA_BASE, categoria: "socio" }, "2026-08");
    const baseFgts = montarCelulasBases(calculo).find((c) => c.rotulo === "BASE FGTS");
    assert.equal(baseFgts.texto, "0,00");
  });
});

describe("gerarTemplateFolha — coluna categoria", () => {
  it("template traz a coluna categoria com lista EMPREGADO,SOCIO", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await gerarTemplateFolha());
    const sheet = wb.worksheets[0];
    const indice = COLUNAS_FOLHA.length + 1;
    assert.equal(sheet.getRow(1).getCell(indice).value, "categoria");
    const dv = sheet.getRow(2).getCell(indice).dataValidation;
    assert.equal(dv.type, "list");
    assert.match(String(dv.formulae).toUpperCase(), /EMPREGADO,SOCIO/);
    assert.equal(sheet.getRow(2).getCell(indice).protection?.locked, false);
  });
});
