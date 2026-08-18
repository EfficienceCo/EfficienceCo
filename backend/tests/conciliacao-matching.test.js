import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { executarMatching } from "../src/utils/conciliacao-matching.util.js";

function t(id, tipo, valor, data) {
  return { id, tipo, valor, data_lancamento: data };
}
function l(id, tipo, valor, data) {
  return { id, tipo, valor, data_lancamento: data };
}

describe("executarMatching — casos focados", () => {
  it("Pass 1: mesmo tipo, mesma data, valores iguais → automatico", () => {
    const pares = executarMatching(
      [t("t1", "credito", 100, "2026-07-01")],
      [l("l1", "credito", 100, "2026-07-01")],
    );
    assert.deepEqual(pares, [{ transacao_id: "t1", lancamento_id: "l1", confianca: "automatico" }]);
  });

  it("Pass 1: tolera diferença de valor de até R$ 0,01", () => {
    const pares = executarMatching(
      [t("t1", "debito", 50, "2026-07-01")],
      [l("l1", "debito", 50.01, "2026-07-01")],
    );
    assert.equal(pares[0].confianca, "automatico");
  });

  it("diferença de valor de R$ 0,02 não casa em nenhum pass", () => {
    const pares = executarMatching(
      [t("t1", "debito", 50, "2026-07-01")],
      [l("l1", "debito", 50.02, "2026-07-01")],
    );
    assert.equal(pares.length, 2);
    assert.ok(pares.every((p) => p.confianca === "sem_par"));
  });

  it("tipos diferentes nunca casam, mesmo com valor e data idênticos", () => {
    const pares = executarMatching(
      [t("t1", "credito", 100, "2026-07-01")],
      [l("l1", "debito", 100, "2026-07-01")],
    );
    assert.equal(pares.length, 2);
    assert.ok(pares.every((p) => p.confianca === "sem_par"));
  });

  it("Pass 2: 1 dia de diferença não fecha no Pass 1, mas fecha no Pass 2", () => {
    const pares = executarMatching(
      [t("t1", "credito", 100, "2026-07-01")],
      [l("l1", "credito", 100, "2026-07-02")],
    );
    assert.equal(pares.length, 1);
    assert.equal(pares[0].confianca, "provavel");
  });

  it("Pass 2: exatamente 3 dias de diferença ainda casa (limite inclusivo)", () => {
    const pares = executarMatching(
      [t("t1", "debito", 100, "2026-07-01")],
      [l("l1", "debito", 100, "2026-07-04")],
    );
    assert.equal(pares[0].confianca, "provavel");
  });

  it("mais de 3 dias de diferença cai em sem_par para ambos os lados", () => {
    const pares = executarMatching(
      [t("t1", "credito", 100, "2026-07-01")],
      [l("l1", "credito", 100, "2026-07-05")],
    );
    assert.equal(pares.length, 2);
    assert.deepEqual(
      pares.map((p) => p.confianca).sort(),
      ["sem_par", "sem_par"],
    );
    const parTransacao = pares.find((p) => p.transacao_id === "t1");
    assert.equal(parTransacao.lancamento_id, null);
    const parLancamento = pares.find((p) => p.lancamento_id === "l1");
    assert.equal(parLancamento.transacao_id, null);
  });

  it("prefere o candidato com menor diferença de dias entre múltiplas opções", () => {
    const pares = executarMatching(
      [t("t1", "credito", 100, "2026-07-05")],
      [
        l("l-longe", "credito", 100, "2026-07-08"),
        l("l-perto", "credito", 100, "2026-07-06"),
      ],
    );
    assert.equal(pares.length, 2);
    const parAutomatico = pares.find((p) => p.confianca !== "sem_par");
    assert.equal(parAutomatico.lancamento_id, "l-perto");
  });

  it("nenhuma transação ou lançamento é reutilizado em mais de um par", () => {
    const pares = executarMatching(
      [t("t1", "credito", 100, "2026-07-01"), t("t2", "credito", 100, "2026-07-02")],
      [l("l1", "credito", 100, "2026-07-01")],
    );
    // t1 fecha automatico com l1; t2 sobra sem_par (l1 já foi consumido por t1)
    assert.equal(pares.length, 2);
    const idsLancamentoUsados = pares.map((p) => p.lancamento_id).filter(Boolean);
    assert.equal(new Set(idsLancamentoUsados).size, idsLancamentoUsados.length);
  });
});

describe("executarMatching — dataset misto de 20+ transações", () => {
  // 8 pares que fecham no Pass 1 (mesma data, mesmo tipo, valor exato ou com
  // diferença de até R$0,01), com valores exclusivos por par (100-800) para que
  // nenhum item de outro grupo possa acidentalmente virar candidato.
  const automaticoTransacoes = [
    t("t1", "credito", 101.0, "2026-07-01"),
    t("t2", "debito", 102.0, "2026-07-02"),
    t("t3", "credito", 103.0, "2026-07-03"),
    t("t4", "debito", 104.0, "2026-07-04"),
    t("t5", "credito", 105.0, "2026-07-05"),
    t("t6", "debito", 106.0, "2026-07-06"),
    t("t7", "credito", 107.0, "2026-07-07"),
    t("t8", "debito", 108.0, "2026-07-08"),
  ];
  const automaticoLancamentos = [
    l("l1", "credito", 101.0, "2026-07-01"),
    l("l2", "debito", 102.0, "2026-07-02"),
    l("l3", "credito", 103.0, "2026-07-03"),
    l("l4", "debito", 104.0, "2026-07-04"),
    l("l5", "credito", 105.0, "2026-07-05"),
    l("l6", "debito", 106.01, "2026-07-06"), // diferença de valor no limite (R$0,01)
    l("l7", "credito", 107.0, "2026-07-07"),
    l("l8", "debito", 108.0, "2026-07-08"),
  ];

  // 7 pares que sobram do Pass 1 (datas diferentes) e fecham no Pass 2, com
  // diferença de data entre 1 e 3 dias.
  const provavelTransacoes = [
    t("t9", "credito", 201.0, "2026-07-10"),
    t("t10", "debito", 202.0, "2026-07-12"),
    t("t11", "credito", 203.0, "2026-07-16"),
    t("t12", "debito", 204.0, "2026-07-20"),
    t("t13", "credito", 205.0, "2026-07-25"),
    t("t14", "debito", 206.0, "2026-07-26"),
    t("t15", "credito", 207.0, "2026-07-30"),
  ];
  const provavelLancamentos = [
    l("l9", "credito", 201.0, "2026-07-11"), // +1 dia
    l("l10", "debito", 202.0, "2026-07-15"), // +3 dias (limite)
    l("l11", "credito", 203.01, "2026-07-18"), // +2 dias, valor no limite
    l("l12", "debito", 204.0, "2026-07-22"), // +2 dias
    l("l13", "credito", 205.0, "2026-07-24"), // -1 dia (lançamento antes da transação)
    l("l14", "debito", 206.0, "2026-07-29"), // +3 dias
    l("l15", "credito", 207.0, "2026-08-01"), // +2 dias, cruzando mês
  ];

  // 5 transações sem lançamento correspondente e 2 lançamentos sem transação
  // correspondente — sobram para o Pass 3.
  const semParTransacoes = [
    t("t16", "credito", 301.0, "2026-07-05"),
    t("t17", "debito", 302.0, "2026-07-06"),
    t("t18", "credito", 303.0, "2026-07-07"),
    t("t19", "debito", 304.0, "2026-07-12"),
    t("t20", "credito", 305.0, "2026-07-13"),
  ];
  const semParLancamentos = [
    l("l21", "debito", 401.0, "2026-07-10"),
    l("l22", "credito", 402.0, "2026-07-11"),
  ];

  const transacoes = [...automaticoTransacoes, ...provavelTransacoes, ...semParTransacoes];
  const lancamentos = [...automaticoLancamentos, ...provavelLancamentos, ...semParLancamentos];

  it("dataset tem 20+ transações combinando os 3 cenários", () => {
    assert.ok(transacoes.length >= 20, "dataset de transações deve ter 20+ itens");
  });

  const pares = executarMatching(transacoes, lancamentos);

  it("Pass 1 casa corretamente os 8 matches exatos", () => {
    const automaticos = pares.filter((p) => p.confianca === "automatico");
    assert.equal(automaticos.length, 8);
    for (let i = 1; i <= 8; i++) {
      assert.ok(
        automaticos.some((p) => p.transacao_id === `t${i}` && p.lancamento_id === `l${i}`),
        `esperava par automatico t${i}/l${i}`,
      );
    }
  });

  it("Pass 2 casa os 7 matches que sobraram do Pass 1 com até 3 dias de diferença", () => {
    const provaveis = pares.filter((p) => p.confianca === "provavel");
    assert.equal(provaveis.length, 7);
    for (let i = 9; i <= 15; i++) {
      assert.ok(
        provaveis.some((p) => p.transacao_id === `t${i}` && p.lancamento_id === `l${i}`),
        `esperava par provavel t${i}/l${i}`,
      );
    }
  });

  it("Pass 3 captura as 5 transações e os 2 lançamentos restantes, sem par", () => {
    const semPar = pares.filter((p) => p.confianca === "sem_par");
    assert.equal(semPar.length, 7);

    for (let i = 16; i <= 20; i++) {
      const par = semPar.find((p) => p.transacao_id === `t${i}`);
      assert.ok(par, `esperava sem_par para t${i}`);
      assert.equal(par.lancamento_id, null);
    }
    for (const id of ["l21", "l22"]) {
      const par = semPar.find((p) => p.lancamento_id === id);
      assert.ok(par, `esperava sem_par para ${id}`);
      assert.equal(par.transacao_id, null);
    }
  });

  it("nenhuma transação ou lançamento aparece em mais de um par", () => {
    const idsTransacao = pares.map((p) => p.transacao_id).filter(Boolean);
    const idsLancamento = pares.map((p) => p.lancamento_id).filter(Boolean);
    assert.equal(new Set(idsTransacao).size, idsTransacao.length);
    assert.equal(new Set(idsLancamento).size, idsLancamento.length);
  });

  it("totais batem com a contagem real dos pares", () => {
    assert.equal(pares.length, transacoes.length + semParLancamentos.length);
    assert.equal(pares.filter((p) => p.confianca === "automatico").length, 8);
    assert.equal(pares.filter((p) => p.confianca === "provavel").length, 7);
    assert.equal(pares.filter((p) => p.confianca === "sem_par").length, 7);
  });
});
