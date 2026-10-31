import { describe, it } from "node:test";
import assert from "node:assert/strict";
import supabase from "../src/config/database.js";
import { PERFIS } from "../src/config/perfis.js";
import { resumoLancamentosFiscais } from "../src/controllers/lancamentos-fiscais.controller.js";
import {
  analisarMonetario,
  recomputarInconsistencias,
  validarItensNfe,
  validarLancamentoFiscal,
  validarTpNf,
} from "../src/utils/lancamento-fiscal.util.js";
import { arredondar, cnpjValido, cpfValido } from "../src/utils/comum.util.js";

// ===========================================================================
// TEST-10 (#687) — a NF-e do dataset do QA-E conferida no backend, com número de fora do código.
//
// ORIGEM DOS NÚMEROS (todos de fora do código):
//   - vault: problemas/escrituracao-fiscal-qa-e-2026-10-12 (relatório do QA-E, "números refeitos à
//     mão": valor, ICMS, PIS, COFINS e IPI de cada nota e os totais de jan/fev/mar 2025) e o gerador
//     problemas/anexos-qa-e-2026-10-12/gen_nfe3.py (ICMS 18%, PIS 1,65%, COFINS 7,6%, HALF_UP).
//     As mesmas 33 notas estão como fixture XML em agente/worker/tests/fixtures/nfe/qae-2026-10-12/
//     (agente/worker/tests/test_nfe_dataset_qae.py); aqui entram os campos que o agente envia.
//   - DV de CPF/CNPJ: regra da Receita (módulo 11), contas à mão nos comentários.
//   - CFOP: primeiro dígito 1/2/3 = entrada, 5/6/7 = saída (Ajuste SINIEF 07/2001, tabela de CFOP).
//   - Arredondamento x.xx5: decisões/padrao-arredondamento (João, 24/10): meia-unidade para cima.
//
// O backend não lê o XML: recebe o JSON do agente. O esperado abaixo é o do relatório do QA-E.
// ===========================================================================

const HOJE = "2026-10-31";
const DEV = "11111111000191";
const TESTE = "00000000000272";
const FORN1 = "11222333000181";
const FORN2 = "44555666000181";
const TERC_A = "12345678000195";
const TERC_B = "98765432000198";
const CPF_OK = "52998224725";
const CPF_PRODUTOR = "11144477735";
const NCM_PADARIA = "19059090";

const CHAVE = {
  v01: "35250111222333000181559120000000011202610130",
  v02: "35250144555666000181559120000000021202610145",
  v03: "35250111111111000191559120000000031202610150",
  v04: "35250111111111000191559120000000041202610166",
  v05: "35250244555666000181559120000000051202610175",
  v06: "35250211111111000191559120000000061202610180",
  v07: "35250311222333000181559120000000071202610190",
  v08: "35250311111111000191559120000000081202610200",
  v09: "35250300000000000272559120000000091202610219",
  v10: "35250311111111000191559120000000101202610225",
  v11: "35250311222333000181559120000000111202610230",
  n10: "35250300011144477735559120000000301202610428",
};

// [arquivo, chave, tipo do ponto de vista do cliente Dev, emitente, destinatário,
//  vNF, vICMS, vPIS, vCOFINS, vIPI (undefined = sem tag), emissão, CFOP]
const VALIDAS = [
  ["v01-entrada", "v01", "entrada", FORN1, DEV, "1234.56", "222.22", "20.37", "93.83", "61.73", "2025-01-10", "5102"],
  ["v02-entrada", "v02", "entrada", FORN2, DEV, "987.65", "177.78", "16.30", "75.06", undefined, "2025-01-20", "6102"],
  ["v03-saida", "v03", "saida", DEV, TERC_A, "2500.00", "450.00", "41.25", "190.00", undefined, "2025-01-25", "5102"],
  ["v04-saida-cpf", "v04", "saida", DEV, CPF_OK, "640.00", "115.20", "10.56", "48.64", undefined, "2025-01-28", "5102"],
  ["v05-entrada-latin1", "v05", "entrada", FORN2, DEV, "333.33", "60.00", "5.50", "25.33", undefined, "2025-02-05", "5102"],
  ["v06-saida-a-cancelar", "v06", "saida", DEV, TERC_B, "1500.00", "270.00", "24.75", "114.00", undefined, "2025-02-14", "5102"],
  ["v07-entrada-dEmi", "v07", "entrada", FORN1, DEV, "100.10", "18.02", "1.65", "7.61", undefined, "2025-03-03", "5102"],
  ["v08-emit-igual-dest", "v08", "entrada", DEV, DEV, "50.00", "9.00", "0.83", "3.80", undefined, "2025-03-10", "5102"],
  ["v09-teste-para-dev", "v09", "entrada", TESTE, DEV, "200.00", "36.00", "3.30", "15.20", undefined, "2025-03-12", "5102"],
  ["v10-saida-cfop-entrada", "v10", "saida", DEV, TERC_A, "10.00", "1.80", "0.17", "0.76", undefined, "2025-03-15", "1102"],
  ["v11-cstat150", "v11", "entrada", FORN1, DEV, "20.00", "3.60", "0.33", "1.52", undefined, "2025-03-18", "5102"],
];

function payload([, chave, , emit, dest, vnf, icms, pis, cofins, ipi, emissao, cfop], extra = {}) {
  return {
    chave_nfe: CHAVE[chave],
    cnpj_emitente: emit,
    cnpj_destinatario: dest,
    valor_total: vnf,
    icms,
    pis,
    cofins,
    ...(ipi === undefined ? {} : { ipi }),
    data_emissao: emissao,
    tp_nf: 1,
    itens: [{ n_item: 1, cfop, ncm: NCM_PADARIA }],
    ...extra,
  };
}

describe("TEST-10 — as 11 notas válidas do QA-E passam na validação do POST /lancamentos-fiscais", () => {
  for (const linha of VALIDAS) {
    const [arquivo, chave, , emit, dest, vnf, icms, pis, cofins, ipi, emissao, cfop] = linha;
    it(`${arquivo}: válida, com os valores do relatório do QA-E`, () => {
      const r = validarLancamentoFiscal(payload(linha), HOJE);
      assert.equal(r.valido, true, JSON.stringify(r.erros));
      assert.equal(r.dados.chave_nfe, CHAVE[chave]);
      assert.equal(r.dados.cnpj_emitente, emit);
      assert.equal(r.dados.cnpj_destinatario, dest);
      assert.equal(r.dados.valor_total, vnf);
      assert.equal(r.dados.icms, icms);
      assert.equal(r.dados.pis, pis);
      assert.equal(r.dados.cofins, cofins);
      assert.equal(r.dados.ipi, ipi ?? "0.00");
      assert.equal(r.dados.data_emissao, emissao);
      assert.deepEqual(r.dados.itens, [{ n_item: 1, cfop, ncm: NCM_PADARIA }]);
    });
  }
});

describe("TEST-10 — negativos do QA-E que o backend decide", () => {
  const base = VALIDAS[0];

  it("n12-vnf-negativo: vNF -10,00 vira 422 em valor_total (não pode ser negativo)", () => {
    const r = validarLancamentoFiscal(payload(base, { valor_total: "-10.00" }), HOJE);
    assert.equal(r.valido, false);
    assert.equal(r.erros.valor_total, "valor_total não pode ser negativo");
  });

  it("n11-data-futura: emissão em 01/12/2026 com hoje = 31/10/2026 vira erro em data_emissao", () => {
    const r = validarLancamentoFiscal(payload(base, { data_emissao: "2026-12-01" }), HOJE);
    assert.equal(r.valido, false);
    assert.equal(r.erros.data_emissao, "data_emissao não pode ser futura");
  });

  it("a data de hoje ainda vale; amanhã não", () => {
    // Só o campo data_emissao importa aqui (a chave da v01 é de 2025: o PR #676 vai cruzar chave x data).
    assert.equal(validarLancamentoFiscal(payload(base, { data_emissao: "2026-10-31" }), HOJE).erros.data_emissao, undefined);
    assert.equal(
      validarLancamentoFiscal(payload(base, { data_emissao: "2026-11-01" }), HOJE).erros.data_emissao,
      "data_emissao não pode ser futura",
    );
  });

  it("n09-cpf-dv-invalido: destinatário CPF 52998224726 (DV certo é 25) vira erro", () => {
    const r = validarLancamentoFiscal(payload(VALIDAS[3], { cnpj_destinatario: "52998224726" }), HOJE);
    assert.equal(r.valido, false);
    assert.equal(r.erros.cnpj_destinatario, "cnpj_destinatario não é um CPF válido");
  });
});

describe("TEST-10 — chave de acesso", () => {
  const v02 = VALIDAS[1];

  it("44 dígitos entra (v02, DV 5 calculado à mão: ver test_chave_dv_certo no agente)", () => {
    assert.equal(validarLancamentoFiscal(payload(v02), HOJE).valido, true);
  });

  it("tamanho errado: 43 e 45 dígitos viram erro em chave_nfe", () => {
    for (const chave of [CHAVE.v02.slice(0, 43), `${CHAVE.v02}0`, "", CHAVE.v02.slice(0, 10)]) {
      const r = validarLancamentoFiscal(payload(v02, { chave_nfe: chave }), HOJE);
      assert.equal(r.erros.chave_nfe, "chave_nfe deve ter exatamente 44 dígitos", `chave ${chave}`);
    }
  });

  it("com letras: erro em chave_nfe, em qualquer posição", () => {
    for (const [pos, letra] of [[0, "A"], [20, "x"], [43, "Z"]]) {
      const chave = CHAVE.v02.slice(0, pos) + letra + CHAVE.v02.slice(pos + 1);
      assert.equal(chave.length, 44);
      const r = validarLancamentoFiscal(payload(v02, { chave_nfe: chave }), HOJE);
      assert.equal(r.erros.chave_nfe, "chave_nfe deve ter exatamente 44 dígitos", `chave ${chave}`);
    }
  });

  it("não-string (número, null, ausente) vira erro em chave_nfe", () => {
    for (const chave of [35250144555666000181559120000000021202610145, null, undefined, ["x"]]) {
      assert.equal(
        validarLancamentoFiscal(payload(v02, { chave_nfe: chave }), HOJE).erros.chave_nfe,
        "chave_nfe deve ter exatamente 44 dígitos",
      );
    }
  });

  it.skip("DV errado vira erro em chave_nfe (v02 com DV 4 em vez de 5) — BUG (#661, NFE-7; PR #676 aberto): o backend só confere 44 dígitos", () => {
    // Módulo 11, soma 578, resto 6, DV = 5 (conta completa no teste do agente). Com DV 4 a chave é inventada.
    const r = validarLancamentoFiscal(payload(v02, { chave_nfe: `${CHAVE.v02.slice(0, 43)}4` }), HOJE);
    assert.equal(r.valido, false);
    assert.match(r.erros.chave_nfe, /dígito verificador/);
  });
});

describe("TEST-10 — emitente: CNPJ, CPF e documento inválido", () => {
  const v01 = VALIDAS[0];

  it("CNPJ válido entra (11.222.333/0001-81: DV1 = 8, DV2 = 1; contas no teste do agente)", () => {
    const r = validarLancamentoFiscal(payload(v01), HOJE);
    assert.equal(r.valido, true);
    assert.equal(r.dados.cnpj_emitente, FORN1);
  });

  it("CNPJ com DV errado, repetido, curto ou longo vira erro em cnpj_emitente", () => {
    for (const emit of ["11222333000182", "11222333000191", "11111111111111", "1122233300018", "112223330001810"]) {
      const r = validarLancamentoFiscal(payload(v01, { cnpj_emitente: emit }), HOJE);
      assert.equal(r.valido, false, `emitente ${emit}`);
      assert.ok(r.erros.cnpj_emitente, `emitente ${emit}`);
    }
  });

  it("documento com letras, máscara ou não-string vira erro (o agente manda só dígitos)", () => {
    for (const emit of ["11.222.333/0001-81", "1122233300018A", 11222333000181, null]) {
      const r = validarLancamentoFiscal(payload(v01, { cnpj_emitente: emit }), HOJE);
      assert.ok(r.erros.cnpj_emitente, `emitente ${String(emit)}`);
    }
  });

  // n10: emit/CPF 111.444.777-35 (produtor rural), aceito desde o NFE-5 (#659, PR #675).
  it("n10-emitente-produtor-cpf: CPF de 11 dígitos, sem padar, entra", () => {
    // CPF 111.444.777-35: DV1 = 162*10 mod 11 = 3; DV2 = 204*10 mod 11 = 5.
    const r = validarLancamentoFiscal(
      payload(v01, { chave_nfe: CHAVE.n10, cnpj_emitente: CPF_PRODUTOR, cnpj_destinatario: DEV, valor_total: "300.00",
        icms: "54.00", pis: "4.95", cofins: "22.80", data_emissao: "2025-03-25" }),
      HOJE,
    );
    assert.equal(r.valido, true, JSON.stringify(r.erros));
    assert.equal(r.dados.cnpj_emitente, CPF_PRODUTOR);
  });

  it("emitente CPF com DV errado (11144477736) vira erro em cnpj_emitente", () => {
    const r = validarLancamentoFiscal(payload(v01, { cnpj_emitente: "11144477736" }), HOJE);
    assert.equal(r.erros.cnpj_emitente, "cnpj_emitente não é um CPF válido");
  });
});

describe("TEST-10 — DV de CPF e CNPJ dos documentos do dataset (contas à mão)", () => {
  it("CNPJs do dataset são válidos", () => {
    for (const cnpj of [DEV, TESTE, FORN1, FORN2, TERC_A, TERC_B]) {
      assert.equal(cnpjValido(cnpj), true, cnpj);
    }
  });

  it("os CNPJs que o gerador usava em 12/10 têm DV errado pela DOC-1 (por isso foram trocados)", () => {
    // 11.111.111/0001-11: DV1: 5+4+3+2+9+8+7+6+0+0+0+2 = 46; 46 mod 11 = 2 -> 9 (e não 1). DV2 certo = 1, mas
    // com DV1 = 9 o CNPJ válido é 11111111000191 (o que o dataset usa hoje). Os outros três pelo mesmo módulo 11:
    // 44555666000172 (certo: 81), 98765432000110 (certo: 98), 00000000000100 (certo: 91).
    for (const cnpj of ["11111111000111", "44555666000172", "98765432000110", "00000000000100"]) {
      assert.equal(cnpjValido(cnpj), false, cnpj);
    }
  });

  it("CPFs do dataset: 529.982.247-25 e 111.444.777-35 válidos; troca de qualquer DV invalida", () => {
    // 529.982.247-25: DV1: 5x10+2x9+9x8+9x7+8x6+2x5+2x4+4x3+7x2 = 50+18+72+63+48+10+8+12+14 = 295;
    //   2950 mod 11 = 2 -> DV1 = 2. DV2: 5x11+2x10+9x9+9x8+8x7+2x6+2x5+4x4+7x3+2x2 = 55+20+81+72+56+12+10+16+21+4 = 347;
    //   3470 mod 11 = 5 -> DV2 = 5.
    assert.equal(295 * 10 % 11, 2);
    assert.equal(347 * 10 % 11, 5);
    assert.equal(cpfValido("52998224725"), true);
    assert.equal(cpfValido("52998224726"), false);
    assert.equal(cpfValido("52998224715"), false);
    assert.equal(cpfValido("11144477735"), true);
    assert.equal(cpfValido("11144477736"), false);
    assert.equal(cpfValido("11144477745"), false);
  });
});

describe("TEST-10 — CFOP e NCM por item; alerta, nunca recusa", () => {
  it("item com CFOP de 4 dígitos e NCM de 8 passa; máscara é removida", () => {
    const r = validarItensNfe([{ n_item: 1, cfop: "5.102", ncm: "1905.90.90" }]);
    assert.deepEqual(r.valor, [{ n_item: 1, cfop: "5102", ncm: "19059090" }]);
  });

  it("dois itens saem ordenados por n_item", () => {
    const r = validarItensNfe([
      { n_item: 2, cfop: "6102", ncm: "22030000" },
      { n_item: 1, cfop: "5102", ncm: NCM_PADARIA },
    ]);
    assert.deepEqual(r.valor.map((i) => i.n_item), [1, 2]);
  });

  it("formato inválido recusa (3 dígitos de CFOP, 7 de NCM, letras, lista vazia, n_item repetido)", () => {
    assert.match(validarItensNfe([{ n_item: 1, cfop: "510", ncm: NCM_PADARIA }]).erro, /cfop deve ter exatamente 4 dígitos/);
    assert.match(validarItensNfe([{ n_item: 1, cfop: "5102", ncm: "1905909" }]).erro, /ncm deve ter exatamente 8 dígitos/);
    assert.match(validarItensNfe([{ n_item: 1, cfop: "ABCD", ncm: NCM_PADARIA }]).erro, /cfop/);
    assert.match(validarItensNfe([]).erro, /pelo menos um item/);
    assert.match(
      validarItensNfe([{ n_item: 1, cfop: "5102", ncm: NCM_PADARIA }, { n_item: 1, cfop: "5102", ncm: NCM_PADARIA }]).erro,
      /duplicado/,
    );
  });

  // Alerta (não recusa): valor bem formado mas incompatível com a direção ou fora da TIPI.
  const sem = [];
  const item = (cfop, ncm = NCM_PADARIA, n = 1) => ({ n_item: n, cfop, ncm });

  it("v10: saída (tpNF=1) com CFOP 1102 gera 1 alerta cfop_incompativel_tpnf e a nota segue válida", () => {
    const itens = validarItensNfe([item("1102")]).valor;
    assert.deepEqual(recomputarInconsistencias(1, itens), [
      { tipo: "cfop_incompativel_tpnf", n_item: 1, detalhe: "CFOP 1102 incompatível com tpNF=1" },
    ]);
    assert.equal(validarLancamentoFiscal(payload(VALIDAS[9]), HOJE).valido, true);
  });

  it("tpNF define a direção: CFOP 1/2/3 só combina com tpNF=0 e 5/6/7 só com tpNF=1", () => {
    for (const cfop of ["1102", "2102", "3102"]) {
      assert.deepEqual(recomputarInconsistencias(0, [item(cfop)]), sem, `tpNF=0 ${cfop}`);
      assert.equal(recomputarInconsistencias(1, [item(cfop)]).length, 1, `tpNF=1 ${cfop}`);
    }
    for (const cfop of ["5102", "6102", "7102"]) {
      assert.deepEqual(recomputarInconsistencias(1, [item(cfop)]), sem, `tpNF=1 ${cfop}`);
      assert.equal(recomputarInconsistencias(0, [item(cfop)]).length, 1, `tpNF=0 ${cfop}`);
    }
  });

  it("CFOP começando com 0, 4, 8 ou 9 não existe na tabela e alerta nas duas direções", () => {
    for (const cfop of ["0102", "4102", "8102", "9102"]) {
      assert.equal(recomputarInconsistencias(0, [item(cfop)]).length, 1, `tpNF=0 ${cfop}`);
      assert.equal(recomputarInconsistencias(1, [item(cfop)]).length, 1, `tpNF=1 ${cfop}`);
    }
  });

  it("NCM de 8 dígitos fora da TIPI gera alerta ncm_inexistente; NCM da padaria e cerveja não", () => {
    assert.deepEqual(recomputarInconsistencias(1, [item("5102", "99999999")]), [
      { tipo: "ncm_inexistente", n_item: 1, detalhe: "NCM 99999999 não consta na tabela TIPI" },
    ]);
    assert.deepEqual(recomputarInconsistencias(1, [item("5102", "00000000")]).map((a) => a.tipo), ["ncm_inexistente"]);
    assert.deepEqual(recomputarInconsistencias(1, [item("5102", NCM_PADARIA), item("5102", "22030000", 2)]), sem);
  });

  it("alerta é por item: dois itens ruins geram dois alertas, cada um no seu n_item", () => {
    const alertas = recomputarInconsistencias(1, [item("1102", NCM_PADARIA, 1), item("5102", "99999999", 2), item("5102", NCM_PADARIA, 3)]);
    assert.deepEqual(alertas.map((a) => [a.n_item, a.tipo]), [[1, "cfop_incompativel_tpnf"], [2, "ncm_inexistente"]]);
  });

  it("tp_nf: só 0 e 1 (número ou texto); outro valor recusa", () => {
    assert.deepEqual(validarTpNf(0), { valor: 0 });
    assert.deepEqual(validarTpNf("1"), { valor: 1 });
    for (const ruim of [2, "2", "", null, undefined, "S", -1]) {
      assert.match(validarTpNf(ruim).erro, /tp_nf deve ser 0 \(entrada\) ou 1 \(saída\)/, String(ruim));
    }
    assert.equal(validarLancamentoFiscal(payload(VALIDAS[0], { tp_nf: 3 }), HOJE).erros.tp_nf.includes("tp_nf"), true);
  });
});

describe("TEST-10 — valores monetários do dataset", () => {
  it("analisarMonetario devolve a escala 2 sem arredondar: centavos do QA-E ficam como estão", () => {
    for (const v of ["1234.56", "987.65", "0.83", "0.17", "100.10"]) {
      assert.deepEqual(analisarMonetario(v), { valor: v });
    }
    assert.deepEqual(analisarMonetario("50"), { valor: "50.00" });
  });

  it("a terceira casa não é arredondada pela API, é recusada (o agente já manda 2 casas)", () => {
    assert.equal(analisarMonetario("0.825").erro, "deve ter no máximo 2 casas decimais");
  });
});

// ---------------------------------------------------------------------------
// Totais por direção — resumo de jan, fev e mar/2025 do relatório do QA-E
// ---------------------------------------------------------------------------

const originalFrom = supabase.from;

function criarResposta() {
  return {
    statusCode: null,
    body: null,
    status(codigo) { this.statusCode = codigo; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

async function resumoCom(linhas) {
  supabase.from = () => {
    const builder = {
      select() { return builder; },
      eq() { return builder; },
      gte() { return builder; },
      lte() { return builder; },
      then(resolve, reject) { return Promise.resolve({ data: linhas, error: null }).then(resolve, reject); },
    };
    return builder;
  };
  try {
    const res = criarResposta();
    await resumoLancamentosFiscais(
      { usuario: { perfil: PERFIS.ADMIN_CLIENTE, cliente_id: "11111111-1111-1111-1111-111111111111" }, query: {} },
      res,
    );
    assert.equal(res.statusCode, 200);
    return res.body;
  } finally {
    supabase.from = originalFrom;
  }
}

function linhaResumo(arquivo) {
  const l = VALIDAS.find((v) => v[0] === arquivo);
  const [, , tipo, , , vnf, icms, pis, cofins, ipi] = l;
  return { tipo, status: "ativa", valor_total: Number(vnf), icms: Number(icms), pis: Number(pis), cofins: Number(cofins), ipi: Number(ipi ?? 0) };
}

describe("TEST-10 — totais por direção: entrada e saída nunca somadas (resumo do QA-E)", () => {
  it("jan/2025: entradas v01+v02 e saídas v03+v04, cada lado com a sua conta", async () => {
    // Entradas: 1.234,56 + 987,65 = 2.222,21; ICMS 222,22 + 177,78 = 400,00; PIS 20,37 + 16,30 = 36,67;
    //           COFINS 93,83 + 75,06 = 168,89; IPI 61,73.
    // Saídas:   2.500,00 + 640,00 = 3.140,00; ICMS 450,00 + 115,20 = 565,20; PIS 41,25 + 10,56 = 51,81;
    //           COFINS 190,00 + 48,64 = 238,64; IPI 0.
    // O relatório mostra a soma ERRADA dos dois lados (R$ 5.362,21, ICMS 965,20); o resumo não pode devolvê-la.
    const corpo = await resumoCom(["v01-entrada", "v02-entrada", "v03-saida", "v04-saida-cpf"].map(linhaResumo));
    assert.deepEqual(corpo, {
      total_nfe: 4,
      entradas: { quantidade: 2, valor_total: 2222.21, icms: 400, pis: 36.67, cofins: 168.89, ipi: 61.73 },
      saidas: { quantidade: 2, valor_total: 3140, icms: 565.2, pis: 51.81, cofins: 238.64, ipi: 0 },
    });
    assert.deepEqual(Object.keys(corpo).sort(), ["entradas", "saidas", "total_nfe"]);
    // A soma errada do relatório (2.222,21 + 3.140,00 = 5.362,21) não pode aparecer em nenhum dos lados.
    assert.notEqual(corpo.entradas.valor_total, 5362.21);
    assert.notEqual(corpo.saidas.valor_total, 5362.21);
    assert.notEqual(corpo.entradas.icms, 965.2);
    assert.notEqual(corpo.saidas.icms, 965.2);
  });

  it("fev/2025: a saída cancelada (v06, R$ 1.500,00) fica fora; só a entrada de 333,33 conta", async () => {
    const cancelada = { ...linhaResumo("v06-saida-a-cancelar"), status: "cancelada" };
    const corpo = await resumoCom([linhaResumo("v05-entrada-latin1"), cancelada]);
    assert.deepEqual(corpo, {
      total_nfe: 1,
      entradas: { quantidade: 1, valor_total: 333.33, icms: 60, pis: 5.5, cofins: 25.33, ipi: 0 },
      saidas: { quantidade: 0, valor_total: 0, icms: 0, pis: 0, cofins: 0, ipi: 0 },
    });
  });

  it("mar/2025: 4 entradas (v07, v08, v09, v11) e 1 saída (v10), sem as 3 indevidas do 1º ciclo", async () => {
    // Entradas: 100,10 + 50,00 + 200,00 + 20,00 = 370,10; ICMS 18,02 + 9,00 + 36,00 + 3,60 = 66,62;
    //           PIS 1,65 + 0,83 + 3,30 + 0,33 = 6,11; COFINS 7,61 + 3,80 + 15,20 + 1,52 = 28,13.
    // Saída:    10,00; ICMS 1,80; PIS 0,17; COFINS 0,76.
    // O relatório fecha março em R$ 2.378,10 (380,10 válidos + 1.998,00 das notas n04-n06), ICMS 428,06.
    const corpo = await resumoCom(["v07-entrada-dEmi", "v08-emit-igual-dest", "v09-teste-para-dev", "v10-saida-cfop-entrada", "v11-cstat150"].map(linhaResumo));
    assert.deepEqual(corpo, {
      total_nfe: 5,
      entradas: { quantidade: 4, valor_total: 370.1, icms: 66.62, pis: 6.11, cofins: 28.13, ipi: 0 },
      saidas: { quantidade: 1, valor_total: 10, icms: 1.8, pis: 0.17, cofins: 0.76, ipi: 0 },
    });
  });
});

// ---------------------------------------------------------------------------
// Arredondamento x.xx5 (UTIL-1 / PR #670) — valor decidido pelo João em 24/10
// ---------------------------------------------------------------------------

describe("TEST-10 — arredondamento x.xx5: meia-unidade para cima (decisoes/padrao-arredondamento)", () => {
  it("casos do dataset do QA-E e do #670 (esperado = regra decidida, escrita à mão)", () => {
    // Cada linha: valor exato em decimal, escrito como literal (0.825 e 0.165 são os números do relatório,
    // não o produto em float, que daria 0.8250000000000001). Só 1621 * 0.075 é intencionalmente um produto
    // (o float cai em 121.57499...); esperado em reais.
    const casos = [
      [0.825, 0.83],          // v08: PIS 0,825 (relatório: março fecha PIS 39,25 com 0,83)
      [0.165, 0.17],          // v10: PIS 0,165
      [10.075, 10.08],         // #670
      [1.005, 1.01],           // #670
      [1621 * 0.075, 121.58],  // INSS/RFB: 121,575 (lote #437)
      [2.675, 2.68],           // clássico do float: 2.67499999999999982
      [1.255, 1.26],
      [0.005, 0.01],
      [0.015, 0.02],
      [8.345, 8.35],
      [1.004, 1],              // 4 para baixo
      [1.0049, 1],
    ];
    for (const [entrada, esperado] of casos) {
      assert.equal(arredondar(entrada), esperado, `arredondar(${entrada})`);
    }
  });

  it("varredura: os 10.000 valores 0,005 a 99,995 (x.xx5) sobem para o centavo seguinte", () => {
    // Esperado em centavos inteiros: n.xx5 -> (n+1) centavos. Entrada = o literal decimal mais próximo.
    const erros = [];
    for (let centavos = 0; centavos < 10000; centavos += 1) {
      const reais = Math.floor(centavos / 100);
      const resto = String(centavos % 100).padStart(2, "0");
      const entrada = Number(`${reais}.${resto}5`);
      const esperado = (centavos + 1) / 100;
      if (arredondar(entrada) !== esperado) erros.push(`${entrada} -> ${arredondar(entrada)} (esperado ${esperado})`);
    }
    assert.deepEqual(erros, []);
  });

  it.todo("negativo x.xx5 (-1,005): -1,01 (afastando de zero, como o código faz hoje) ou -1,00 (para cima)? Decidir (PRB-E-40); a decisão de 24/10 só fala de positivos");
});
