// TEST-DAS-1 (#729) — os 11 cenários que o QA-F conferiu à mão em 2026-10-12, de ponta a ponta
// nas funções puras: montarBasesCalculo (notas + histórico + competência + início de atividade)
// → calcularSimplesNacional. "Hoje" = 12/10/2026 (hojeISO "2026-10-12"); última competência
// fechada = 09/2026. Nenhum valor esperado sai do código: contas à mão no comentário de cada
// cenário (fonte: vault problemas/apuracao-simples-qa-f-2026-10-12.md e
// tasks/sprint-2026-11-apuracao-simples.md, TEST-DAS-1). Catálogo: PRB-AP-22, 23, 24, 25, 26, 27.
//
// Como os testes cobrem as funções NÃO exportadas do controller:
// - calcularJanela12MesesAnteriores: via montarBasesCalculo (a janela define o RBT12 e a composição
//   `rbt12Mensal`; cada cenário confere as referências da janela).
// - filtrarNotasAtivas: montarBasesCalculo NÃO descarta nota cancelada (quem filtra é o controller,
//   antes da chamada). Só dá para exercitá-la pela rota: o bloco "via dispararApuracao" abaixo
//   põe a saída cancelada de R$ 5.000 no retorno do banco e confere que o DAS sai sem ela.

import { describe, it, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import supabase from "../src/config/database.js";
import { PERFIS } from "../src/config/perfis.js";
import { montarBasesCalculo, dispararApuracao } from "../src/controllers/apuracoes.controller.js";
import { calcularSimplesNacional } from "../src/utils/simples-nacional.util.js";

const HOJE = "2026-10-12";

const saida = (data_emissao, valor_total, extra = {}) => ({ tipo: "saida", data_emissao, valor_total, ...extra });

// Uma saída por mês, dia 10, de AAAA-MM inicial a AAAA-MM final (inclusive).
function saidasMensais(de, ate, valor) {
  const [anoDe, mesDe] = de.split("-").map(Number);
  const [anoAte, mesAte] = ate.split("-").map(Number);
  const notas = [];
  for (let i = anoDe * 12 + (mesDe - 1); i <= anoAte * 12 + (mesAte - 1); i += 1) {
    const ano = Math.floor(i / 12);
    const mes = (i % 12) + 1;
    notas.push(saida(`${ano}-${String(mes).padStart(2, "0")}-10`, valor));
  }
  return notas;
}

function apurar({ anexo, folha12 = null, ...entrada }) {
  const bases = montarBasesCalculo({ hojeISO: HOJE, ...entrada });
  if (bases.erro) return { bases };
  const das = calcularSimplesNacional({ rbt12: bases.rbt12, receita_mes: bases.receitaMes, anexo, folha12 });
  return { bases, das };
}

function assertProximo(real, esperado) {
  assert.ok(Math.abs(real - esperado) < 1e-12, `${real} != ${esperado}`);
}

// ---------------------------------------------------------------------------
// Cenários 1 a 4 — Anexo I, início 15/06/2026, R$ 50.000/mês em 06, 07 e 08; R$ 7.000 em 05/2026.
// ---------------------------------------------------------------------------
describe("QA-F 2026-10-12 — cenários 1 a 4: Anexo I, início de atividade em 15/06/2026", () => {
  const notas = [
    saida("2026-05-20", 7000), // antes do início: nunca entra
    saida("2026-06-20", 50000),
    saida("2026-07-20", 50000),
    saida("2026-08-20", 50000),
  ];
  const base = { anexo: "I", notas, historicoReceita: [], dataInicioAtividade: "2026-06-15" };

  it("QA-F 2026-10-12, cenário 1 — comp. 06/2026: 50k × 12 = 600k → faixa 3 → (600k × 9,5% − 13.860) ÷ 600k = 7,19% → DAS R$ 3.595,00", () => {
    // 600.000 × 0,095 = 57.000; − 13.860 = 43.140; ÷ 600.000 = 0,0719; × 50.000 = 3.595.
    const { bases, das } = apurar({ ...base, mes: 6, ano: 2026 });
    assert.equal(bases.rbt12Metodo, "proporcional_inicio_atividade");
    assert.equal(bases.mesesAtividade, 0);
    assert.equal(bases.rbt12, 600000);
    assert.equal(bases.receitaMes, 50000);
    assert.equal(das.faixa_limite, 720000);
    assertProximo(das.aliquota_efetiva, 0.0719);
    assert.equal(das.valor_das, 3595);
  });

  it("QA-F 2026-10-12, cenário 2 — comp. 08/2026: (100k ÷ 2) × 12 = 600k → 7,19% × 50k → DAS R$ 3.595,00", () => {
    const { bases, das } = apurar({ ...base, mes: 8, ano: 2026 });
    assert.equal(bases.mesesAtividade, 2);
    // Janela 08/2025–07/2026; só 06 e 07/2026 existem (meses antes do início não viram zero).
    assert.deepEqual(bases.rbt12Mensal.map((m) => m.referencia), ["2026-06", "2026-07"]);
    assert.equal(bases.rbt12, 600000);
    assert.equal(bases.receitaMes, 50000);
    assert.equal(das.valor_das, 3595);
  });

  it("QA-F 2026-10-12, cenário 3 — comp. 09/2026 com R$ 60.000: (150k ÷ 3) × 12 = 600k; 60k × 7,19% → DAS R$ 4.314,00", () => {
    const { bases, das } = apurar({ ...base, notas: [...notas, saida("2026-09-15", 60000)], mes: 9, ano: 2026 });
    assert.equal(bases.mesesAtividade, 3);
    assert.deepEqual(bases.rbt12Mensal.map((m) => m.referencia), ["2026-06", "2026-07", "2026-08"]);
    assert.equal(bases.rbt12, 600000);
    assert.equal(bases.receitaMes, 60000);
    assert.equal(das.valor_das, 4314);
  });

  it("QA-F 2026-10-12, cenário 4 — comp. 05/2026, anterior ao início: recusa PERIODO_ANTERIOR_AO_INICIO_ATIVIDADE (no HTTP, 422)", () => {
    const { bases } = apurar({ ...base, mes: 5, ano: 2026 });
    assert.deepEqual(bases, { erro: "PERIODO_ANTERIOR_AO_INICIO_ATIVIDADE" });
  });
});

// ---------------------------------------------------------------------------
// Cenários 5 a 8 — Anexo I, início 2019, R$ 25.000/mês de 09/2025 a 08/2026.
// ---------------------------------------------------------------------------
describe("QA-F 2026-10-12 — cenários 5 a 8: Anexo I, atividade desde 2019, R$ 25.000/mês de 09/2025 a 08/2026", () => {
  const INICIO_2019 = "2019-03-01";
  // O histórico de 09/2025 (99.999) existe, mas 09/2025 tem NF-e: a NF-e é a fonte primária e o histórico é ignorado.
  const historico = [{ mes: 9, ano: 2025, receita: 99999 }];
  const meses = saidasMensais("2025-09", "2026-08", 25000);
  const mesAtual09 = [
    saida("2026-09-05", 20000),
    saida("2026-09-20", 10000),
    { tipo: "entrada", data_emissao: "2026-09-12", valor_total: 9000 }, // entrada não é receita
    saida("2026-10-05", 8000), // mês ainda aberto em 12/10/2026
  ];
  // A saída CANCELADA de 5.000 (06/09) é descartada ANTES, por filtrarNotasAtivas no controller;
  // por isso ela não está aqui. Ver o bloco "via dispararApuracao" para a nota cancelada de verdade.
  const base = { anexo: "I", historicoReceita: historico, dataInicioAtividade: INICIO_2019 };

  it("QA-F 2026-10-12, cenário 5 — comp. 09/2026: RBT12 300k → (300k × 7,3% − 5.940) ÷ 300k = 5,32% × 30k → DAS R$ 1.596,00", () => {
    // 300.000 × 0,073 = 21.900; − 5.940 = 15.960; ÷ 300.000 = 0,0532; × 30.000 = 1.596.
    const { bases, das } = apurar({ ...base, notas: [...meses, ...mesAtual09], mes: 9, ano: 2026 });
    assert.equal(bases.rbt12Metodo, "janela_12_meses");
    assert.equal(bases.mesesAtividade, null);
    // calcularJanela12MesesAnteriores(9, 2026) = 09/2025 a 08/2026.
    assert.equal(bases.janelaRbt12.inicio, "2025-09-01");
    assert.equal(bases.janelaRbt12.fim, "2026-08-31");
    assert.equal(bases.rbt12Mensal.length, 12);
    assert.equal(bases.rbt12Mensal[0].referencia, "2025-09");
    assert.equal(bases.rbt12Mensal[0].receita_historico, 0);
    assert.equal(bases.rbt12Mensal[0].receita_nfes, 25000);
    assert.equal(bases.rbt12, 300000);
    assert.equal(bases.receitaMes, 30000); // 20k + 10k de saída; sem a entrada de 9k, sem a nota de 05/10
    assert.equal(das.faixa_limite, 360000);
    assertProximo(das.aliquota_efetiva, 0.0532);
    assert.equal(das.valor_das, 1596);
    // Sanidade do histórico ignorado: com 99.999 somado o RBT12 seria 374.999.
    assert.notEqual(bases.rbt12, 374999);
  });

  it("QA-F 2026-10-12, cenário 6 — comp. 08/2026: janela 08/25 a 07/26 = 11 × 25k = 275k → 5,14% × 25k → DAS R$ 1.285,00", () => {
    // 275.000 × 0,073 = 20.075; − 5.940 = 14.135; ÷ 275.000 = 0,0514; × 25.000 = 1.285.
    const { bases, das } = apurar({ ...base, notas: [...meses, ...mesAtual09], mes: 8, ano: 2026 });
    assert.equal(bases.janelaRbt12.inicio, "2025-08-01");
    assert.equal(bases.janelaRbt12.fim, "2026-07-31");
    assert.equal(bases.rbt12, 275000);
    assert.equal(bases.receitaMes, 25000);
    assertProximo(das.aliquota_efetiva, 0.0514);
    assert.equal(das.valor_das, 1285);
  });

  it("QA-F 2026-10-12, cenário 7 — + NF-e de R$ 12.000 em 25/03/2026 (recálculo), comp. 09/2026: RBT12 312k → 5,39615% × 30k → DAS R$ 1.618,85", () => {
    // 300.000 + 12.000 = 312.000; 312.000 × 0,073 = 22.776; − 5.940 = 16.836; ÷ 312.000 = 0,0539615…; × 30.000 = 1.618,846…
    const { bases, das } = apurar({
      ...base,
      notas: [...meses, saida("2026-03-25", 12000), ...mesAtual09],
      mes: 9,
      ano: 2026,
    });
    assert.equal(bases.rbt12, 312000);
    assert.equal(bases.receitaMes, 30000);
    assertProximo(das.aliquota_efetiva, 16836 / 312000);
    assert.equal(das.valor_das, 1618.85);
  });

  it("QA-F 2026-10-12, cenário 8 — comp. 07/2026: 10 × 25k + 12k = 262k → 5,03282% × 25k → DAS R$ 1.258,21", () => {
    // Janela 07/2025–06/2026: 09/2025 a 06/2026 = 10 meses × 25.000 = 250.000, + 12.000 (03/2026) = 262.000.
    // 262.000 × 0,073 = 19.126; − 5.940 = 13.186; ÷ 262.000 = 0,0503282…; × 25.000 = 1.258,206… → 1.258,21.
    const { bases, das } = apurar({
      ...base,
      notas: [...meses, saida("2026-03-25", 12000), ...mesAtual09],
      mes: 7,
      ano: 2026,
    });
    assert.equal(bases.janelaRbt12.inicio, "2025-07-01");
    assert.equal(bases.janelaRbt12.fim, "2026-06-30");
    assert.equal(bases.rbt12, 262000);
    assert.equal(bases.receitaMes, 25000);
    assert.ok(das.aliquota_efetiva > 0.050328 && das.aliquota_efetiva < 0.050329);
    assert.equal(das.valor_das, 1258.21);
  });
});

// ---------------------------------------------------------------------------
// Cenário 9 — Anexo V, Fator R com pró-labore.
// ---------------------------------------------------------------------------
describe("QA-F 2026-10-12 — cenário 9: Anexo V, Fator R com pró-labore", () => {
  const notas = saidasMensais("2025-09", "2026-09", 20000);
  const base = { anexo: "V", notas, historicoReceita: [], dataInicioAtividade: "2019-03-01", mes: 9, ano: 2026 };

  // 12 meses (09/2025 a 08/2026): sócio pró-labore 4.000 (FGTS 0) + CLT 1.800 (FGTS 144).
  const linhasFolhaMes = [
    { base_calculo: 4000, fgts: 0 },
    { base_calculo: 1800, fgts: 144 },
  ];
  const somaFolha = (linhas) => 12 * linhas.reduce((s, l) => s + l.base_calculo + l.fgts, 0);

  it("QA-F 2026-10-12, cenário 9 (motor puro, folha12 informada à mão) — FS12 = 12 × 5.944 = 71.328; Fator R 0,2972 → 0,29 → Anexo III 7,3% × 20k → DAS R$ 1.460,00", () => {
    // FS12 = 12 × (4.000 + 0 + 1.800 + 144) = 12 × 5.944 = 71.328 (FGTS do sócio = 0).
    const fs12 = somaFolha(linhasFolhaMes);
    assert.equal(fs12, 71328);
    // RBT12 = 12 × 20.000 = 240.000; FR = 71.328 ÷ 240.000 = 0,2972 → trunca 0,29 (≥ 0,28 → Anexo III).
    // III, 2ª faixa: (240.000 × 11,2% − 9.360) ÷ 240.000 = (26.880 − 9.360) ÷ 240.000 = 0,073; × 20.000 = 1.460.
    const { bases, das } = apurar({ ...base, folha12: fs12 });
    assert.equal(bases.rbt12, 240000);
    assert.equal(bases.receitaMes, 20000);
    assert.equal(das.fator_r, 0.29);
    assert.equal(das.anexo_original, "V");
    assert.equal(das.anexo_efetivo, "III");
    assertProximo(das.aliquota_efetiva, 0.073);
    assert.equal(das.valor_das, 1460);
  });

  it("QA-F 2026-10-12, cenário 9 (motor puro, sem o pró-labore) — FS12 = 12 × 1.944 = 23.328; Fator R 0,0972 → 0,09 → Anexo V 16,125% × 20k → DAS R$ 3.225,00", () => {
    const fs12 = somaFolha([linhasFolhaMes[1]]);
    assert.equal(fs12, 23328);
    // V, 2ª faixa: (240.000 × 18% − 4.500) ÷ 240.000 = (43.200 − 4.500) ÷ 240.000 = 0,16125; × 20.000 = 3.225.
    const { bases, das } = apurar({ ...base, folha12: fs12 });
    assert.equal(bases.rbt12, 240000);
    assert.equal(das.fator_r, 0.09);
    assert.equal(das.anexo_efetivo, "V");
    assertProximo(das.aliquota_efetiva, 0.16125);
    assert.equal(das.valor_das, 3225);
  });
});

// ---------------------------------------------------------------------------
// Cenários 10, 11 e o teto.
// ---------------------------------------------------------------------------
describe("QA-F 2026-10-12 — cenários 10 e 11 e o teto de R$ 4,8 milhões", () => {
  it("QA-F 2026-10-12, cenário 10 — Anexo III, R$ 320.000/mês: RBT12 3,84M → 16,125% × 320k → DAS R$ 51.600,00", () => {
    // 12 × 320.000 = 3.840.000; (3.840.000 × 33% − 648.000) ÷ 3.840.000 = 619.200 ÷ 3.840.000 = 0,16125; × 320.000 = 51.600.
    const { bases, das } = apurar({
      anexo: "III",
      notas: saidasMensais("2025-09", "2026-09", 320000),
      historicoReceita: [],
      dataInicioAtividade: "2019-03-01",
      mes: 9,
      ano: 2026,
    });
    assert.equal(bases.rbt12, 3840000);
    assert.equal(bases.receitaMes, 320000);
    assert.equal(das.faixa_limite, 4800000);
    assertProximo(das.aliquota_efetiva, 0.16125);
    assert.equal(das.valor_das, 51600);
  });

  it("QA-F 2026-10-12, cenário 11 — Anexo III, início 01/07/2026, histórico de 30k em 07 e 08, NF-e de 30k em 09: (60k ÷ 2) × 12 = 360k → 8,6% × 30k → DAS R$ 2.580,00", () => {
    // 360.000 × 0,112 = 40.320; − 9.360 = 30.960; ÷ 360.000 = 0,086; × 30.000 = 2.580. RBT12 = 360.000 está NO limite da 2ª faixa.
    const { bases, das } = apurar({
      anexo: "III",
      notas: [saida("2026-09-10", 30000)],
      historicoReceita: [
        { mes: 7, ano: 2026, receita: 30000 },
        { mes: 8, ano: 2026, receita: 30000 },
      ],
      dataInicioAtividade: "2026-07-01",
      mes: 9,
      ano: 2026,
    });
    assert.equal(bases.rbt12Metodo, "proporcional_inicio_atividade");
    assert.equal(bases.mesesAtividade, 2);
    assert.equal(bases.rbt12, 360000);
    assert.equal(bases.receitaMes, 30000);
    assert.equal(das.faixa_limite, 360000);
    assertProximo(das.aliquota_efetiva, 0.086);
    assert.equal(das.valor_das, 2580);
  });

  it("QA-F 2026-10-12, cenário F (Anexo I, R$ 410.000/mês = 4,92M, 09/2026): acima de 4,8M → RBT12_ACIMA_DO_LIMITE", () => {
    const { bases, das } = apurar({
      anexo: "I",
      notas: saidasMensais("2025-09", "2026-09", 410000),
      historicoReceita: [],
      dataInicioAtividade: "2019-03-01",
      mes: 9,
      ano: 2026,
    });
    assert.equal(bases.rbt12, 4920000);
    assert.deepEqual(das, { erro: "RBT12_ACIMA_DO_LIMITE" });
  });

  it("borda do teto: R$ 400.000/mês = 4.800.000,00 exatos ainda calcula (Anexo I, 6ª faixa: (4,8M × 19% − 378.000) ÷ 4,8M = 11,125% × 400k = R$ 44.500,00)", () => {
    // 4.800.000 × 0,19 = 912.000; − 378.000 = 534.000; ÷ 4.800.000 = 0,11125; × 400.000 = 44.500.
    const { bases, das } = apurar({
      anexo: "I",
      notas: saidasMensais("2025-09", "2026-09", 400000),
      historicoReceita: [],
      dataInicioAtividade: "2019-03-01",
      mes: 9,
      ano: 2026,
    });
    assert.equal(bases.rbt12, 4800000);
    assert.equal(das.valor_das, 44500);
  });
});

// ---------------------------------------------------------------------------
// filtrarNotasAtivas e o resto do caminho do controller, pela rota (dispararApuracao) com banco falso.
// Relógio simulado em 12/10/2026 12:00 (BRT) para o "hoje" do QA valer também na rota.
// ---------------------------------------------------------------------------
describe("QA-F 2026-10-12 — via dispararApuracao (filtrarNotasAtivas + janela, banco falso e relógio em 12/10/2026)", () => {
  const CLIENTE = "11111111-1111-1111-1111-111111111111";
  const originalFrom = supabase.from;
  let respostas;
  let inseridos;

  before(() => {
    mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-12T15:00:00Z") });
    supabase.from = (tabela) => {
      const builder = {
        select() { return builder; },
        insert(payload) { inseridos.push(payload); builder.ultimo = payload; return builder; },
        eq() { return builder; },
        gte() { return builder; },
        lte() { return builder; },
        in() { return builder; },
        order() { return builder; },
        maybeSingle() { return Promise.resolve(respostas[tabela]?.maybeSingle ?? { data: null, error: null }); },
        single() { return Promise.resolve({ data: { id: "apuracao-1", ...builder.ultimo }, error: null }); },
        then(resolve, reject) {
          return Promise.resolve(respostas[tabela]?.await ?? { data: [], error: null }).then(resolve, reject);
        },
      };
      return builder;
    };
  });

  after(() => {
    supabase.from = originalFrom;
    mock.timers.reset();
  });

  async function disparar({ cliente, notas, mes, ano, extras = {} }) {
    inseridos = [];
    respostas = {
      clientes: { maybeSingle: { data: { nome: "Cliente Teste", regime_tributario: "simples_nacional", ...cliente }, error: null } },
      lancamentos_fiscais: { await: { data: notas, error: null } },
      ...extras,
    };
    const res = {
      statusCode: null,
      body: null,
      status(codigo) { this.statusCode = codigo; return this; },
      json(payload) { this.body = payload; return this; },
    };
    const req = {
      body: { clienteId: CLIENTE, mes, ano, regime: "simples_nacional" },
      params: {},
      query: {},
      usuario: { perfil: PERFIS.ADMIN_CLIENTE, cliente_id: CLIENTE, id: "user-1", email: "contador@teste.com" },
    };
    await dispararApuracao(req, res);
    return res;
  }

  const cliente5 = {
    anexo_simples: "I",
    historico_receita: [{ mes: 9, ano: 2025, receita: 99999 }],
    data_inicio_atividade: "2019-03-01",
  };
  const notas5 = [
    ...saidasMensais("2025-09", "2026-08", 25000),
    saida("2026-09-05", 20000),
    saida("2026-09-20", 10000),
    { tipo: "entrada", data_emissao: "2026-09-12", valor_total: 9000 },
    saida("2026-09-06", 5000, { status: "cancelada" }), // PRB-AP-16: some da auditoria, mas NÃO da conta
    saida("2026-10-05", 8000),
  ];

  it("QA-F 2026-10-12, cenário 5 pela rota: a saída CANCELADA de R$ 5.000 é descartada (filtrarNotasAtivas) → receita 30.000, RBT12 300.000, DAS R$ 1.596,00", async () => {
    const res = await disparar({ cliente: cliente5, notas: notas5, mes: 9, ano: 2026 });

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.receita_mes, 30000); // com a cancelada (35.000) o DAS seria 1.862,00
    assert.equal(res.body.rbt12_usado, 300000);
    assert.equal(res.body.valor_calculado, 1596);
    assert.equal(inseridos[0].valor_calculado, 1596);
    assert.equal(inseridos[0].folha_status, null);
  });

  it("QA-F 2026-10-12, cenário 7 pela rota: com a NF-e de 12.000 em 25/03/2026 o DAS é R$ 1.618,85 e a cancelada continua fora", async () => {
    const res = await disparar({
      cliente: cliente5,
      notas: [...notas5, saida("2026-03-25", 12000)],
      mes: 9,
      ano: 2026,
    });

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.rbt12_usado, 312000);
    assert.equal(res.body.receita_mes, 30000);
    assert.equal(res.body.valor_calculado, 1618.85);
  });

  it("QA-F 2026-10-12, cenário 4 pela rota: competência anterior ao início responde 422 PERIODO_ANTERIOR_AO_INICIO_ATIVIDADE", async () => {
    const res = await disparar({
      cliente: { anexo_simples: "I", historico_receita: [], data_inicio_atividade: "2026-06-15" },
      notas: [saida("2026-05-20", 7000)],
      mes: 5,
      ano: 2026,
    });

    assert.equal(res.statusCode, 422);
    assert.deepEqual(res.body, { erro: "PERIODO_ANTERIOR_AO_INICIO_ATIVIDADE" });
  });

  // Cenário 9 pela rota: exercita coletarFolha12 (soma base_calculo + fgts de folha_calculos) com os
  // números do cenário. Anexo V, 20k/mês de 09/2025 a 09/2026; 12 processamentos concluídos (09/2025 a 08/2026).
  const processamentos9 = saidasMensais("2025-09", "2026-08", 0).map((n, i) => ({
    id: `proc-9-${i + 1}`,
    mes_referencia: `${n.data_emissao.slice(0, 7)}-01`,
    criado_em: `${n.data_emissao.slice(0, 7)}-28T00:00:00.000Z`,
  }));
  const notas9 = saidasMensais("2025-09", "2026-09", 20000);
  const cliente9 = { anexo_simples: "V", historico_receita: [], data_inicio_atividade: "2019-03-01" };
  // Uma linha de sócio (pró-labore 4.000, FGTS 0) e uma de CLT (1.800, FGTS 144) por mês.
  const linhasMes9 = [
    { base_calculo: 4000, fgts: 0 },
    { base_calculo: 1800, fgts: 144 },
  ];
  const repetir12 = (linhas) => processamentos9.flatMap(() => linhas);

  it("QA-F 2026-10-12, cenário 9 pela rota (coletarFolha12): FS12 = 12 × (4.000 + 1.800 + 144) = 71.328 → Fator R 0,29 → Anexo III → DAS R$ 1.460,00", async () => {
    const res = await disparar({
      cliente: cliente9,
      notas: notas9,
      mes: 9,
      ano: 2026,
      extras: {
        processamentos_folha: { await: { data: processamentos9, error: null } },
        folha_calculos: { await: { data: repetir12(linhasMes9), error: null } },
      },
    });

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.rbt12_usado, 240000);
    assert.equal(res.body.folha12, 71328);
    assert.equal(res.body.fator_r, 0.29);
    assert.equal(res.body.anexo, "III");
    assert.equal(res.body.valor_calculado, 1460);
    assert.equal(inseridos[0].folha_status, "verificado");
  });

  it("QA-F 2026-10-12, cenário 9 pela rota (sem o pró-labore): FS12 = 12 × (1.800 + 144) = 23.328 → Fator R 0,09 → Anexo V → DAS R$ 3.225,00", async () => {
    const res = await disparar({
      cliente: cliente9,
      notas: notas9,
      mes: 9,
      ano: 2026,
      extras: {
        processamentos_folha: { await: { data: processamentos9, error: null } },
        folha_calculos: { await: { data: repetir12([linhasMes9[1]]), error: null } },
      },
    });

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.folha12, 23328);
    assert.equal(res.body.fator_r, 0.09);
    assert.equal(res.body.anexo, "V");
    assert.equal(res.body.valor_calculado, 3225);
  });

  // Cliente D do QA-F: Anexo V, início 01/05/2026, saídas de 15k de 05 a 09/2026; folha de 05 a 08/2026
  // com pró-labore de 6.000. Pelo art. 26 §4º da Res. CGSN 140/2018 (conforme D1/D2 do sprint; lei não reconferida nesta sessão) (c/c art. 22 §§2º a 4º) a FS12 é
  // anualizada: (4 × 6.000 ÷ 4) × 12 = 72.000; RBT12 = (4 × 15.000 ÷ 4) × 12 = 180.000; Fator R 0,40 →
  // Anexo III, 1ª faixa, 6% → 15.000 × 6% = R$ 900,00. Hoje o controller só aceita folha com 12 processamentos
  // concluídos (coletarFolha12), então devolve o provisório do pior caso: Anexo V 15,5% → R$ 2.325,00.
  it(
    "QA-F 2026-10-12, cenário D (art. 26 §4º): Anexo V com 4 meses de folha anualiza a FS12 (72.000) → Fator R 0,40 → Anexo III → DAS R$ 900,00",
    { skip: "BUG (DAS-2) PRB-AP-14: coletarFolha12 exige 12 processamentos e não anualiza a FS12 (art. 26 §4º); hoje sai provisório de R$ 2.325,00" },
    async () => {
      const processamentos = ["2026-05", "2026-06", "2026-07", "2026-08"].map((mesRef, i) => ({
        id: `proc-${i + 1}`,
        mes_referencia: `${mesRef}-01`,
        criado_em: `${mesRef}-02T00:00:00.000Z`,
      }));
      const res = await disparar({
        cliente: { anexo_simples: "V", historico_receita: [], data_inicio_atividade: "2026-05-01" },
        notas: [
          saida("2026-05-10", 15000),
          saida("2026-06-10", 15000),
          saida("2026-07-10", 15000),
          saida("2026-08-10", 15000),
          saida("2026-09-10", 15000),
        ],
        mes: 9,
        ano: 2026,
        extras: {
          processamentos_folha: { await: { data: processamentos, error: null } },
          folha_calculos: { await: { data: processamentos.map(() => ({ base_calculo: 6000, fgts: 0 })), error: null } },
        },
      });

      assert.equal(res.statusCode, 201);
      assert.equal(res.body.rbt12_usado, 180000);
      assert.equal(res.body.folha12, 72000);
      assert.equal(res.body.fator_r, 0.4);
      assert.equal(res.body.anexo, "III");
      assert.equal(res.body.valor_calculado, 900);
    },
  );
});
