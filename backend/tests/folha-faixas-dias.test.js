// FOLHA-4 (#744): faixas de valor da planilha, dias_trabalhados no cálculo e competência
// sem tabela fiscal. Um teste por item do "Pronto quando" do card.
//
// Números esperados, conferidos fora do código (conta à mão com as tabelas oficiais,
// mês comercial de 30 dias; nunca tirados do próprio motor):
//  - INSS 2026 (gov.br/inss): 7,5% até 1.621,00; 9% até 2.902,84; 12% até 4.354,27.
//  - INSS 2025 (Portaria MPS/MF nº 6/2025): 7,5% até 1.518,00; 9% até 2.793,88; 12% até 4.190,83.
//  - IRRF 2026: rendimento até 5.000,00 tem o imposto zerado (Lei 15.270/2025).
//  - IRRF jan-abr/2025: desconto simplificado de 564,80 contra a dedução legal.
//  - QA-B de 2026-10-12 (problemas/folha-qa-b-2026-10-12.md no vault): lote A (Paulo,
//    2.751,40) e lote C (adiantamento 5.000 com salário 2.000 → −3.155,69).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  COLUNAS_FOLHA,
  COLUNA_CATEGORIA,
  COLUNA_CNPJ,
  TabelaFolhaAusenteError,
  calcularFolhaFuncionario,
  calcularFolhaLinhas,
  calcularSalarioMes,
  gerarTemplateFolha,
  lerLinhasPlanilha,
  montarCelulasBases,
  montarLinhasVerbas,
  resolverTabelaFolha,
} from "../src/services/folha.service.js";

const CPF_A = "529.982.247-25";
const CPF_B = "123.456.789-09";

const LINHA_BASE = {
  empresa: "Empresa Sintetica",
  funcionario: "Paulo Sintetico",
  cpf: CPF_A,
  cargo: "Auxiliar",
  salario_bruto: 3000,
  dias_trabalhados: 30,
  horas_extras: 0,
  faltas: 0,
  adiantamento: 0,
  num_dependentes: 0,
  vale_transporte: false,
};

// Linha como sai de lerLinhasPlanilha (já numérica), para o motor.
const linha = (over = {}) => ({ linha: 2, ...LINHA_BASE, ...over });

async function planilha(linhas) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Folha");
  ws.addRow(COLUNAS_FOLHA.map((c) => c.header));
  for (const campos of linhas) {
    const dados = { ...LINHA_BASE, ...campos };
    ws.addRow(COLUNAS_FOLHA.map((c) => dados[c.key]));
  }
  return wb.xlsx.writeBuffer();
}

async function lerUma(campos) {
  return lerLinhasPlanilha(await planilha([campos]));
}

function assertRecusada({ linhas, erros }, padrao, numeroLinha = 2) {
  assert.deepEqual(linhas, [], "nenhuma linha pode passar quando há erro");
  const daLinha = erros.find((e) => e.linha === numeroLinha);
  assert.ok(daLinha, `esperava erro na linha ${numeroLinha}; erros: ${JSON.stringify(erros)}`);
  assert.ok(
    daLinha.motivos.some((m) => padrao.test(m)),
    `nenhum motivo casa com ${padrao}; motivos: ${JSON.stringify(daLinha.motivos)}`,
  );
}

function assertAceita({ linhas, erros }) {
  assert.deepEqual(erros, []);
  assert.equal(linhas.length, 1);
  return linhas[0];
}

// ---------------------------------------------------------------------------
// Faixas: recusadas com linha e motivo, no formato { linha, motivos[] }
// ---------------------------------------------------------------------------

describe("lerLinhasPlanilha — dias_trabalhados de 1 a 30", () => {
  for (const dias of [0, 31, 45, 15.5]) {
    it(`recusa ${dias} dizendo a faixa e que 30 = mês completo`, async () => {
      assertRecusada(await lerUma({ dias_trabalhados: dias }), /dias_trabalhados.*inteiro de 1 a 30.*30 = mês completo/);
    });
  }

  for (const dias of [1, 15, 30]) {
    it(`aceita ${dias}`, async () => {
      assert.equal(assertAceita(await lerUma({ dias_trabalhados: dias })).dias_trabalhados, dias);
    });
  }
});

describe("lerLinhasPlanilha — faltas até os dias trabalhados", () => {
  it("faltas 31 com 30 dias (lote C do QA-B): recusada", async () => {
    assertRecusada(await lerUma({ salario_bruto: 2000, faltas: 31 }), /faltas \(31\) maior que dias_trabalhados \(30\)/);
  });

  it("faltas 16 com 15 dias: recusada", async () => {
    assertRecusada(await lerUma({ dias_trabalhados: 15, faltas: 16 }), /faltas \(16\) maior que dias_trabalhados \(15\)/);
  });

  it("faltas iguais aos dias: aceita", async () => {
    assertAceita(await lerUma({ dias_trabalhados: 15, faltas: 15 }));
  });
});

describe("lerLinhasPlanilha — num_dependentes inteiro ≥ 0 (sem arredondar em silêncio)", () => {
  for (const valor of ["1,5", 1.5, 0.4]) {
    it(`recusa ${JSON.stringify(valor)}`, async () => {
      assertRecusada(await lerUma({ num_dependentes: valor }), /num_dependentes deve ser um número inteiro/);
    });
  }

  it("recusa negativo", async () => {
    assertRecusada(await lerUma({ num_dependentes: -1 }), /num_dependentes deve ser um número não-negativo/);
  });

  it("aceita 0 e 2 como vieram", async () => {
    assert.equal(assertAceita(await lerUma({ num_dependentes: 0 })).num_dependentes, 0);
    assert.equal(assertAceita(await lerUma({ num_dependentes: 2 })).num_dependentes, 2);
  });
});

describe("lerLinhasPlanilha — horas_extras até 4 h por dia trabalhado (CLT art. 61)", () => {
  it("30 dias: aceita 120 h", async () => {
    assertAceita(await lerUma({ horas_extras: 120 }));
  });

  it("30 dias: recusa 121 h", async () => {
    assertRecusada(await lerUma({ horas_extras: 121 }), /horas_extras \(121\) acima do limite de 120 para 30 dias/);
  });

  it("500 h (lote C do QA-B): recusada", async () => {
    assertRecusada(await lerUma({ horas_extras: 500 }), /horas_extras \(500\) acima do limite de 120/);
  });

  it("15 dias: aceita 60 h e recusa 60,5 h", async () => {
    assertAceita(await lerUma({ dias_trabalhados: 15, horas_extras: 60 }));
    assertRecusada(await lerUma({ dias_trabalhados: 15, horas_extras: 60.5 }), /horas_extras \(60,5\) acima do limite de 60 para 15 dias/);
  });
});

describe("lerLinhasPlanilha — salário zero ou negativo", () => {
  it("salário 0: recusado", async () => {
    assertRecusada(await lerUma({ salario_bruto: 0 }), /salario_bruto deve ser maior que zero/);
  });

  it("salário negativo: recusado", async () => {
    assertRecusada(await lerUma({ salario_bruto: -100 }), /salario_bruto deve ser um número não-negativo/);
  });
});

describe("lerLinhasPlanilha — lote de bordas do QA-B: cada linha com o seu motivo, nada passa", () => {
  it("faltas 31, dias 45, dependentes '1,5' e HE 500 em linhas separadas", async () => {
    const { linhas, erros } = await lerLinhasPlanilha(await planilha([
      { cpf: CPF_A, salario_bruto: 2000, faltas: 31 },
      { cpf: CPF_B, dias_trabalhados: 45 },
      { cpf: "111.444.777-35", num_dependentes: "1,5" },
      { cpf: "987.654.321-00", horas_extras: 500 },
      { cpf: "390.533.447-05" },
    ]));
    assert.deepEqual(linhas, []);
    assert.deepEqual(erros.map((e) => e.linha), [2, 3, 4, 5]);
    assert.match(erros[0].motivos.join(), /faltas/);
    assert.match(erros[1].motivos.join(), /dias_trabalhados/);
    assert.match(erros[2].motivos.join(), /num_dependentes/);
    assert.match(erros[3].motivos.join(), /horas_extras/);
  });
});

// ---------------------------------------------------------------------------
// Líquido negativo: erro de linha no cálculo, processamento inteiro recusado
// ---------------------------------------------------------------------------

describe("calcularFolhaLinhas — líquido negativo", () => {
  it("adiantamento 5.000 com salário 2.000 (lote C): erro de linha com os dois valores", () => {
    // Líquido antes do adiantamento: 2.000 − INSS 155,69 (121,575 + 34,11) = 1.844,31.
    const resultado = calcularFolhaLinhas([linha({ salario_bruto: 2000, adiantamento: 5000 })], "2026-09");
    assert.deepEqual(resultado, {
      calculos: [],
      erros: [{ linha: 2, motivos: ["adiantamento de 5.000,00 maior que o líquido de 1.844,31"] }],
    });
  });

  it("uma linha negativa recusa o processamento inteiro (as válidas também não passam)", () => {
    const resultado = calcularFolhaLinhas([
      linha({ linha: 2 }),
      linha({ linha: 3, cpf: CPF_B, salario_bruto: 2000, adiantamento: 5000 }),
    ], "2026-09");
    assert.deepEqual(resultado.calculos, []);
    assert.deepEqual(resultado.erros.map((e) => e.linha), [3]);
  });

  it("descontos fixos maiores que os proventos (30 faltas em 30 dias, com VT): motivo genérico", () => {
    // Base 0; VT = 6% de 3.000 = 180,00 → líquido −180,00.
    const { erros } = calcularFolhaLinhas([linha({ faltas: 30, vale_transporte: true })], "2026-09");
    assert.deepEqual(erros, [{ linha: 2, motivos: ["líquido negativo de -180,00: os descontos passam dos proventos"] }]);
  });

  it("líquido zero é aceito", () => {
    const resultado = calcularFolhaLinhas([linha({ salario_bruto: 2000, adiantamento: 1844.31 })], "2026-09");
    assert.deepEqual(resultado.erros, []);
    assert.equal(resultado.calculos.length, 1);
    assert.equal(resultado.calculos[0].liquido, 0);
  });
});

// ---------------------------------------------------------------------------
// dias_trabalhados no cálculo: salário do mês = salário × dias ÷ 30
// ---------------------------------------------------------------------------

const valores = ({ base_calculo, inss, fgts, ir, liquido }) => ({ base_calculo, inss, fgts, ir, liquido });

describe("calcularFolhaFuncionario — salário do mês proporcional aos dias", () => {
  it("Paulo (3.000, 15 dias, 09/2026): salário 1.500,00, INSS 112,50, FGTS 120,00, IRRF 0, líquido 1.387,50", () => {
    // INSS 1.500 × 7,5% = 112,50; FGTS 8% = 120,00; rendimento ≤ 5.000 → IRRF zerado.
    assert.deepEqual(valores(calcularFolhaFuncionario(linha({ dias_trabalhados: 15 }), "2026-09")), {
      base_calculo: 1500, inss: 112.5, fgts: 120, ir: 0, liquido: 1387.5,
    });
  });

  it("2025-03, salário 3.000: INSS 253,41, IRRF 13,20 (simplificado 564,80), líquido 2.733,39", () => {
    // INSS 113,85 + 114,8292 + 24,7344 = 253,4136; base IR 3.000 − 564,80 = 2.435,20 → 7,5% − 169,44 = 13,20.
    assert.deepEqual(valores(calcularFolhaFuncionario(linha(), "2025-03")), {
      base_calculo: 3000, inss: 253.41, fgts: 240, ir: 13.2, liquido: 2733.39,
    });
  });

  it("2026-09, salário 3.000: INSS 248,60, IRRF 0, líquido 2.751,40 (valor do QA)", () => {
    // INSS 121,575 + 115,3656 + 11,6592 = 248,5998.
    assert.deepEqual(valores(calcularFolhaFuncionario(linha(), "2026-09")), {
      base_calculo: 3000, inss: 248.6, fgts: 240, ir: 0, liquido: 2751.4,
    });
  });

  it("hora extra e falta continuam sobre o salário contratual", () => {
    // 15 dias: salário do mês 1.500; HE 2 h = 3.000/220 × 1,5 × 2 = 40,91; falta 1 = 3.000/30 = 100.
    const calculo = calcularFolhaFuncionario(linha({ dias_trabalhados: 15, horas_extras: 2, faltas: 1 }), "2026-09");
    assert.equal(calculo.valor_horas_extras, 40.91);
    assert.equal(calculo.valor_faltas, 100);
    assert.equal(calculo.base_calculo, 1440.91);
  });

  it("desconto de 6% do vale-transporte sai do salário do mês", () => {
    // 6% de 1.500 = 90,00 (não 180,00).
    const calculo = calcularFolhaFuncionario(linha({ dias_trabalhados: 15, vale_transporte: true }), "2026-09");
    assert.equal(calculo.desconto_vt, 90);
    assert.equal(calculo.liquido, 1297.5);
  });

  it("sócio segue a mesma regra de dias: pró-labore 3.000 em 15 dias = 1.500, INSS 11% = 165,00", () => {
    const calculo = calcularFolhaFuncionario(linha({ dias_trabalhados: 15, categoria: "socio" }), "2026-09");
    assert.deepEqual(valores(calculo), { base_calculo: 1500, inss: 165, fgts: 0, ir: 0, liquido: 1335 });
  });

  it("calcularSalarioMes: 30 dias = salário cheio; arredonda a centavo", () => {
    assert.equal(calcularSalarioMes(3000, 30), 3000);
    assert.equal(calcularSalarioMes(3000, 15), 1500);
    assert.equal(calcularSalarioMes(1000, 7), 233.33);
  });
});

// ---------------------------------------------------------------------------
// Holerite: deixa de dizer 15 dias e pagar 30
// ---------------------------------------------------------------------------

describe("holerite de Paulo (15 dias)", () => {
  const calculo = calcularFolhaFuncionario(linha({ dias_trabalhados: 15 }), "2026-09");

  it("SALARIO BASE: ref. 15 → 1.500,00", () => {
    assert.deepEqual(montarLinhasVerbas(calculo)[0], {
      verba: "0001", descricao: "SALARIO BASE", referencia: "15", proventos: "1.500,00", descontos: "",
    });
  });

  it("total de proventos usa o salário do mês; SALAR. BASE continua com o contratual", () => {
    const celulas = Object.fromEntries(montarCelulasBases(calculo).map((c) => [c.rotulo, c.texto]));
    assert.equal(celulas["SALAR. BASE"], "3.000,00");
    assert.equal(celulas["TOT. PROVENTOS"], "1.500,00");
    assert.equal(celulas["TOT. DESCONTOS"], "112,50");
  });
});

// ---------------------------------------------------------------------------
// Competência sem tabela fiscal
// ---------------------------------------------------------------------------

describe("resolverTabelaFolha — competência sem tabela", () => {
  for (const [competencia, mensagem] of [
    ["2027-01", "Sem tabela INSS/IRRF cadastrada para 01/2027"],
    ["2023-12-01", "Sem tabela INSS/IRRF cadastrada para 12/2023"],
  ]) {
    it(`${competencia}: erro próprio com mensagem legível`, () => {
      assert.throws(() => resolverTabelaFolha(competencia), (erro) => {
        assert.ok(erro instanceof TabelaFolhaAusenteError);
        assert.equal(erro.message, mensagem);
        return true;
      });
    });
  }

  it("competência malformada não é TabelaFolhaAusenteError", () => {
    assert.throws(() => resolverTabelaFolha("2026-13"), (erro) => !(erro instanceof TabelaFolhaAusenteError));
  });
});

// ---------------------------------------------------------------------------
// Modelo da planilha: validação nas células, nota em dias_trabalhados, colunas iguais
// ---------------------------------------------------------------------------

describe("gerarTemplateFolha — validação de faixa no modelo", () => {
  async function abrirModelo() {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await gerarTemplateFolha());
    return wb.worksheets[0];
  }
  const coluna = (chave) => COLUNAS_FOLHA.findIndex((c) => c.key === chave) + 1;

  it("mantém as colunas existentes e acrescenta o CNPJ opcional no final", async () => {
    const sheet = await abrirModelo();
    const cabecalho = [];
    sheet.getRow(1).eachCell((cell) => cabecalho.push(cell.value));
    assert.deepEqual(cabecalho, [...COLUNAS_FOLHA, COLUNA_CATEGORIA, COLUNA_CNPJ].map((c) => c.header));
  });

  it("cabeçalho de dias_trabalhados tem nota com a faixa e o mês completo", async () => {
    const sheet = await abrirModelo();
    const nota = sheet.getRow(1).getCell(coluna("dias_trabalhados")).note;
    const texto = typeof nota === "string" ? nota : nota.texts.map((t) => t.text).join("");
    assert.match(texto, /1 a 30/);
    assert.match(texto, /30 = mês completo/);
    assert.match(texto, /Não desconte as faltas aqui/);
  });

  it("linhas de dado validam dias, dependentes, faltas, horas extras, salário e adiantamento", async () => {
    const sheet = await abrirModelo();
    for (const numeroLinha of [2, 501]) {
      const validacao = (chave) => sheet.getRow(numeroLinha).getCell(coluna(chave)).dataValidation;
      const dias = sheet.getRow(numeroLinha).getCell(coluna("dias_trabalhados")).address;

      assert.equal(validacao("dias_trabalhados").type, "whole");
      assert.deepEqual(validacao("dias_trabalhados").formulae.map(Number), [1, 30]);
      assert.equal(validacao("num_dependentes").type, "whole");
      assert.equal(validacao("num_dependentes").operator, "greaterThanOrEqual");
      assert.equal(validacao("faltas").type, "custom");
      assert.match(validacao("faltas").formulae[0], new RegExp(`<=${dias}\\)`));
      assert.equal(validacao("horas_extras").type, "custom");
      assert.match(validacao("horas_extras").formulae[0], new RegExp(`<=4\\*${dias}\\)`));
      assert.equal(validacao("salario_bruto").operator, "greaterThan");
      assert.equal(validacao("adiantamento").operator, "greaterThanOrEqual");
    }
  });
});
