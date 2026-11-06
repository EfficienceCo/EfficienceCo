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

// ---------------------------------------------------------------------------
// TEST-8 (#685): bordas do matching, uma por vez, cada uma com a origem do número.
// Regras de onde saem os limites: ficha da Conciliação (automacoes/) e background
// da task TEST-8 — tolerância de valor de R$ 0,01 e janela de 3 dias (compensação
// D+1 a D+3) são prática de escritório (a ficha marca "confirmar com contador");
// mesmo tipo (crédito/débito); cada lado entra em no máximo um par.
// Conferência à mão do QA-C 2026-10-12 (problemas/conciliacao-qa-c-2026-10-12):
// "tolerância R$ 0,01, janela 3 dias, tipo oposto, Δ4 dias, duplicata" corretos.
// ---------------------------------------------------------------------------

describe("executarMatching — bordas (TEST-8)", () => {
  const confiancaDoPar = (pares, transacaoId) =>
    pares.find((p) => p.transacao_id === transacaoId).confianca;

  describe("tolerância de valor (R$ 0,01 — prática de escritório)", () => {
    it("R$ 0,01 de diferença casa, com o lançamento maior ou menor que a transação", () => {
      // 100,00 × 100,01 e 100,01 × 100,00: a direção da subtração não pode importar.
      assert.equal(confiancaDoPar(executarMatching(
        [t("t1", "credito", 100.0, "2024-06-10")], [l("l1", "credito", 100.01, "2024-06-10")]), "t1"), "automatico");
      assert.equal(confiancaDoPar(executarMatching(
        [t("t1", "credito", 100.01, "2024-06-10")], [l("l1", "credito", 100.0, "2024-06-10")]), "t1"), "automatico");
    });

    it("R$ 0,02 de diferença não casa, nem no Pass 2 (data dentro da janela)", () => {
      const pares = executarMatching(
        [t("t1", "credito", 100.0, "2024-06-10")],
        [l("l1", "credito", 100.02, "2024-06-11")],
      );
      assert.equal(pares.length, 2);
      assert.ok(pares.every((p) => p.confianca === "sem_par"));
    });

    it("ponto flutuante: 106,00 × 106,01 (QA-C AUTO3 × T3) casa nas duas direções", () => {
      // Origem: QA-C 2026-10-12, AUTO3 lançamento 106,01 × T3 extrato 106,00 = automático.
      // Em float, 106.01 - 106.00 = 0.010000000000047748 e passaria de 0.01 sem o arredondamento.
      assert.ok(Math.abs(106.01 - 106.0) > 0.01, "premissa: a subtração crua estoura a tolerância");
      assert.equal(confiancaDoPar(executarMatching(
        [t("t1", "debito", 106.0, "2024-06-12")], [l("l1", "debito", 106.01, "2024-06-12")]), "t1"), "automatico");
      assert.equal(confiancaDoPar(executarMatching(
        [t("t1", "debito", 106.01, "2024-06-12")], [l("l1", "debito", 106.0, "2024-06-12")]), "t1"), "automatico");
    });

    it("valor vindo como string do banco (NUMERIC) é comparado como número", () => {
      const pares = executarMatching(
        [t("t1", "debito", "250.50", "2024-06-12")],
        [l("l1", "debito", "250.51", "2024-06-12")],
      );
      assert.equal(pares[0].confianca, "automatico");
    });
  });

  describe("janela de datas (3 dias — compensação D+1 a D+3)", () => {
    it("3 dias casa como provável, com o lançamento antes ou depois da transação", () => {
      assert.equal(confiancaDoPar(executarMatching(
        [t("t1", "debito", 42.9, "2024-06-17")], [l("l1", "debito", 42.9, "2024-06-20")]), "t1"), "provavel");
      assert.equal(confiancaDoPar(executarMatching(
        [t("t1", "debito", 42.9, "2024-06-20")], [l("l1", "debito", 42.9, "2024-06-17")]), "t1"), "provavel");
    });

    it("4 dias não casa, com o lançamento antes ou depois (QA-C SEMPAR-4DIAS × T7)", () => {
      // Origem: QA-C 2026-10-12, T7 −300,00 em 05/06 × SEMPAR-4DIAS 300,00 em 01/06 = sem par.
      for (const [dataT, dataL] of [["2024-06-05", "2024-06-01"], ["2024-06-01", "2024-06-05"]]) {
        const pares = executarMatching(
          [t("t7", "debito", 300, dataT)], [l("l1", "debito", 300, dataL)]);
        assert.equal(pares.length, 2);
        assert.ok(pares.every((p) => p.confianca === "sem_par"));
      }
    });

    it("a janela atravessa a virada de mês e de ano (31/12 × 02/01 = 2 dias)", () => {
      const pares = executarMatching(
        [t("t1", "credito", 10, "2023-12-31")], [l("l1", "credito", 10, "2024-01-02")]);
      assert.equal(pares[0].confianca, "provavel");
    });

    it("ano bissexto: 28/02 × 02/03 de 2024 são 3 dias (casa); 28/02 × 03/03 são 4 (não casa)", () => {
      assert.equal(executarMatching(
        [t("t1", "credito", 10, "2024-02-28")], [l("l1", "credito", 10, "2024-03-02")])[0].confianca, "provavel");
      assert.equal(executarMatching(
        [t("t1", "credito", 10, "2024-02-28")], [l("l1", "credito", 10, "2024-03-03")]).length, 2);
    });
  });

  describe("tipo (crédito/débito)", () => {
    it("tipo oposto não casa nem como provável (QA-C SEMPAR-TIPO × T8)", () => {
      // Origem: QA-C 2026-10-12, T8 −75,00 em 15/06 × SEMPAR-TIPO crédito 75,00 em 15/06 = sem par.
      const pares = executarMatching(
        [t("t8", "debito", 75, "2024-06-15")], [l("l1", "credito", 75, "2024-06-16")]);
      assert.equal(pares.length, 2);
      assert.ok(pares.every((p) => p.confianca === "sem_par"));
    });
  });

  describe("duplicata e uso único", () => {
    it("duas transações iguais e um só lançamento: um par, e a outra transação fica sem par (QA-C T1 × T10)", () => {
      // Origem: QA-C 2026-10-12, T10 é duplicata de T1 (−1000,00 em 05/06); só existe AUTO1.
      // Qual das duas casa é a pergunta em aberto abaixo: aqui só vale o invariante.
      const pares = executarMatching(
        [t("T1", "debito", 1000, "2024-06-05"), t("T10", "debito", 1000, "2024-06-05")],
        [l("AUTO1", "debito", 1000, "2024-06-05")],
      );
      assert.equal(pares.length, 2);
      assert.equal(pares.filter((p) => p.confianca === "automatico").length, 1);
      const casada = pares.find((p) => p.confianca === "automatico");
      assert.equal(casada.lancamento_id, "AUTO1");
      const sobra = pares.find((p) => p.confianca === "sem_par");
      assert.equal(sobra.lancamento_id, null);
      assert.ok(["T1", "T10"].includes(sobra.transacao_id));
      assert.notEqual(sobra.transacao_id, casada.transacao_id);
    });

    it("um lançamento e duas transações iguais em dias diferentes: o lançamento casa uma só vez", () => {
      const pares = executarMatching(
        [t("t1", "credito", 10, "2024-06-10"), t("t2", "credito", 10, "2024-06-11")],
        [l("l1", "credito", 10, "2024-06-10")],
      );
      assert.equal(pares.filter((p) => p.lancamento_id === "l1").length, 1);
      assert.equal(pares.length, 2);
    });

    it("dois lançamentos e duas transações idênticos: cada um entra em no máximo um par e são 2 pares", () => {
      const pares = executarMatching(
        [t("t1", "debito", 80, "2024-06-10"), t("t2", "debito", 80, "2024-06-10")],
        [l("l1", "debito", 80, "2024-06-10"), l("l2", "debito", 80, "2024-06-10")],
      );
      assert.equal(pares.length, 2);
      assert.ok(pares.every((p) => p.confianca === "automatico"));
      assert.equal(new Set(pares.map((p) => p.transacao_id)).size, 2);
      assert.equal(new Set(pares.map((p) => p.lancamento_id)).size, 2);
    });

    // Pergunta em aberto da TEST-8 (decisão do João pendente): com itens idênticos, qual
    // transação casa com qual lançamento é arbitrário (sem regra por FITID). É aceito ou bug?
    // Enquanto não decidir, nenhum teste afirma um lado.
    it.todo("dois lançamentos e duas transações idênticos: definir qual casa com qual (pergunta em aberto, PRB-C-34)");
  });

  describe("desempate: menor diferença de dias, depois de valor", () => {
    it("entre dois lançamentos válidos, casa o de menor diferença de dias mesmo que o valor esteja mais longe", () => {
      // l-perto: Δ1 dia e R$ 0,01 de diferença; l-longe: Δ3 dias e R$ 0,00. Dias manda.
      const pares = executarMatching(
        [t("t1", "credito", 100.0, "2024-06-10")],
        [l("l-longe", "credito", 100.0, "2024-06-13"), l("l-perto", "credito", 100.01, "2024-06-11")],
      );
      const casado = pares.find((p) => p.transacao_id === "t1");
      assert.equal(casado.lancamento_id, "l-perto");
      assert.equal(casado.confianca, "provavel");
    });

    it("com os mesmos dias de diferença, casa o de menor diferença de valor", () => {
      // Mesma data (Pass 1): l-exato (R$ 0,00) vence l-1c (R$ 0,01), seja qual for a ordem de entrada.
      for (const lancamentos of [
        [l("l-1c", "credito", 100.01, "2024-06-10"), l("l-exato", "credito", 100.0, "2024-06-10")],
        [l("l-exato", "credito", 100.0, "2024-06-10"), l("l-1c", "credito", 100.01, "2024-06-10")],
      ]) {
        const pares = executarMatching([t("t1", "credito", 100.0, "2024-06-10")], lancamentos);
        assert.equal(pares.find((p) => p.transacao_id === "t1").lancamento_id, "l-exato");
      }
    });

    it("com os mesmos dias (Δ2, um antes e um depois), casa o de menor diferença de valor", () => {
      const pares = executarMatching(
        [t("t1", "debito", 50.0, "2024-06-10")],
        [l("l-depois", "debito", 50.01, "2024-06-12"), l("l-antes", "debito", 50.0, "2024-06-08")],
      );
      assert.equal(pares.find((p) => p.transacao_id === "t1").lancamento_id, "l-antes");
    });

    it("o lançamento que sobra sem par é o mais distante", () => {
      const pares = executarMatching(
        [t("t1", "credito", 100, "2024-06-10")],
        [l("l-perto", "credito", 100, "2024-06-11"), l("l-longe", "credito", 100, "2024-06-13")],
      );
      const sobra = pares.find((p) => p.confianca === "sem_par");
      assert.equal(sobra.lancamento_id, "l-longe");
    });
  });

  describe("entradas vazias", () => {
    it("sem transações e sem lançamentos não gera par", () => {
      assert.deepEqual(executarMatching([], []), []);
    });

    it("só transações: todas viram sem par com lançamento nulo; só lançamentos: o inverso", () => {
      assert.deepEqual(executarMatching([t("t1", "credito", 1, "2024-06-01")], []),
        [{ transacao_id: "t1", lancamento_id: null, confianca: "sem_par" }]);
      assert.deepEqual(executarMatching([], [l("l1", "credito", 1, "2024-06-01")]),
        [{ transacao_id: null, lancamento_id: "l1", confianca: "sem_par" }]);
    });
  });
});
