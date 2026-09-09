/**
 * BUG-FOLHA-02 (#438) — o holerite não persistia nem exibia a base de cálculo
 * do IRRF: mesmo com IRRF > 0, o PDF mostrava "BASE IRRF: -".
 *
 * Cobre:
 *  - calcularFolhaFuncionario retorna base_ir (que o controller espalha direto
 *    no insert de folha_calculos);
 *  - a célula "BASE IRRF" do rodapé do holerite exibe a base real quando há
 *    imposto retido e só cai para "-" quando o IRRF é genuinamente 0;
 *  - gerarHoleritePDF continua produzindo um PDF válido.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calcularFolhaFuncionario,
  montarCelulasBases,
  gerarHoleritePDF,
} from "../src/services/folha.service.js";

const DEDUCAO_POR_DEPENDENTE_IR = 189.59;

function linha(sobrescritos = {}) {
  return {
    empresa: "Padaria do João",
    funcionario: "Maria Silva",
    cpf: "111.111.111-11",
    cargo: "Gerente",
    salario_bruto: 6000,
    dias_trabalhados: 30,
    horas_extras: 0,
    faltas: 0,
    adiantamento: 0,
    num_dependentes: 0,
    vale_transporte: false,
    ...sobrescritos,
  };
}

function celulaBaseIrrf(calculo) {
  return montarCelulasBases(calculo).find((c) => c.rotulo === "BASE IRRF");
}

function formatarMoeda(valor) {
  return Number(valor).toFixed(2).replace(".", ",");
}

describe("BUG-FOLHA-02 — base de cálculo do IRRF no holerite", () => {
  it("calcularFolhaFuncionario retorna base_ir = base_calculo - INSS - dedução por dependentes", () => {
    const calculo = calcularFolhaFuncionario(linha({ salario_bruto: 6000, num_dependentes: 2 }));

    assert.ok("base_ir" in calculo, "base_ir precisa estar no retorno para ser persistido");

    const esperado =
      Math.round(
        (calculo.base_calculo - calculo.inss - 2 * DEDUCAO_POR_DEPENDENTE_IR) * 100,
      ) / 100;
    assert.equal(calculo.base_ir, esperado);
    assert.ok(calculo.base_ir > 0);
    assert.ok(calculo.ir > 0, "salário de 6000 deve gerar IRRF > 0 (pré-condição do teste)");
  });

  it("holerite com IRRF > 0 mostra BASE IRRF coerente com o cálculo (não '-')", () => {
    const calculo = calcularFolhaFuncionario(linha({ salario_bruto: 6000 }));
    const celula = celulaBaseIrrf(calculo);

    assert.notEqual(celula.texto, "-");
    assert.equal(celula.texto, formatarMoeda(calculo.base_ir));
  });

  it("BASE IRRF só é '-' quando o IRRF é genuinamente 0", () => {
    const calculo = calcularFolhaFuncionario(linha({ salario_bruto: 1600 }));

    assert.equal(calculo.ir, 0, "salário baixo não deve reter IRRF (pré-condição do teste)");
    assert.equal(celulaBaseIrrf(calculo).texto, "-");
  });

  it("dependentes que zeram o IRRF também zeram a exibição da base (fica '-')", () => {
    const calculo = calcularFolhaFuncionario(linha({ salario_bruto: 3000, num_dependentes: 8 }));

    assert.equal(calculo.ir, 0);
    assert.equal(celulaBaseIrrf(calculo).texto, "-");
  });

  it("montarCelulasBases usa o base_ir persistido, não recalcula", () => {
    // Simula uma linha vinda de folha_calculos com base_ir já gravado.
    const calculoPersistido = {
      salario_bruto: 5000,
      valor_horas_extras: 0,
      valor_faltas: 0,
      adiantamento: 0,
      desconto_vt: 0,
      base_calculo: 5000,
      fgts: 400,
      inss: 500.6,
      base_ir: 4310.81,
      ir: 275.14,
      num_dependentes: 1,
    };

    assert.equal(celulaBaseIrrf(calculoPersistido).texto, "4310,81");
  });

  it("linha legada sem base_ir persistido (pré-migration 86) mostra '-', não '0,00'", () => {
    const calculoLegado = {
      salario_bruto: 5000,
      valor_horas_extras: 0,
      valor_faltas: 0,
      adiantamento: 0,
      desconto_vt: 0,
      base_calculo: 5000,
      fgts: 400,
      inss: 500.6,
      base_ir: null,
      ir: 275.14,
      num_dependentes: 0,
    };

    assert.equal(celulaBaseIrrf(calculoLegado).texto, "-");
  });

  it("gerarHoleritePDF continua gerando um PDF válido com a base preenchida", async () => {
    const calculo = calcularFolhaFuncionario(linha({ salario_bruto: 6000 }));
    const buffer = await gerarHoleritePDF({ ...calculo }, "07/2026");

    assert.ok(Buffer.isBuffer(buffer));
    assert.ok(buffer.length > 500);
    assert.equal(buffer.subarray(0, 5).toString("latin1"), "%PDF-");
  });
});
