import { describe, it } from "node:test";
import assert from "node:assert/strict";
import PDFDocument from "pdfkit";
import { decodificarOfx, parseOfx, inferirMesAno } from "../src/utils/ofx-parser.util.js";
import { executarMatching } from "../src/utils/conciliacao-matching.util.js";
import {
  gerarRelatorioConciliacaoPDF,
  montarConteudoRelatorio,
  formatarMoeda,
} from "../src/services/conciliacao-relatorio.service.js";

// ===========================================================================
// TEST-8 (#685) — dataset do QA-C, conferido à mão, de ponta a ponta no motor puro:
// OFX (Windows-1252) → parseOfx → executarMatching → decisões do contador → totais do PDF.
//
// ORIGEM DOS NÚMEROS (todos de fora do código):
//   problemas/conciliacao-qa-c-2026-10-12 (vault), seção "Dataset da bateria (junho/2024)".
//   O relatório lista os lançamentos e as 10 transações do OFX `qac.ofx` (banco 0237, CHARSET 1252)
//   e o esperado "à mão": 3 automáticos, 3 prováveis (Δ 2, 3 e 2 dias), 4 transações sem par
//   (T7 Δ4 dias, T8 tipo, T9, T10 duplicata) e 3 lançamentos sem par; confirmar PROV1+PROV2 e
//   rejeitar PROV3 → 5 de 10 (50%); PDF: 10 / 5 / 5 pendentes / 4 lançamentos sem par / R$ 4.489,55
//   (1000 + 2450,50 + 106,00 + 890,15 + 42,90 = 4.489,55, conta feita no próprio relatório).
//
// O QUE O RELATÓRIO NÃO TRAZ e foi montado aqui (marcado "montado"): os FITID (T1..T10), os memos
// de T1 e T5..T10 e o resto do memo de T4 (do relatório só vem o trecho "AÇÃO").
// O arquivo frontend/tests/fixtures/conciliacao-332.ofx é outro dataset (4 transações de fev/2022,
// issue #332) e não substitui este.
// ===========================================================================

// Transações do OFX do QA-C (relatório: "OFX (qac.ofx, CHARSET 1252, banco 0237, conta 98765-4)").
// Valor com sinal como no arquivo. Os memos de T2 e T3 vêm por extenso do relatório (item 11); o de T4 só tem "AÇÃO" do relatório;
// o resto é montado.
const TRANSACOES_OFX = [
  { fitid: "T1", dt: "20240605", valor: "-1000.00", memo: "QA-C 2026-10-12 T1 AUTO1" },
  { fitid: "T2", dt: "20240610", valor: "2450.50", memo: "QA-C 2026-10-12 T2 AUTO2 RECEBIMENTO" },
  { fitid: "T3", dt: "20240612", valor: "-106.00", memo: "QA-C 2026-10-12 T3 AUTO3 TARIFA" },
  // relatório: "T4 +890,15 d18 (DTPOSTED com 000000[-3:BRT], memo com 'AÇÃO')"
  { fitid: "T4", dt: "20240618000000[-3:BRT]", valor: "890.15", memo: "QA-C 2026-10-12 T4 PROV1 AÇÃO" },
  { fitid: "T5", dt: "20240617", valor: "-42.90", memo: "QA-C 2026-10-12 T5 PROV2" },
  { fitid: "T6", dt: "20240623", valor: "1180.00", memo: "QA-C 2026-10-12 T6 PROV3" },
  { fitid: "T7", dt: "20240605", valor: "-300.00", memo: "QA-C 2026-10-12 T7 SEMPAR-4DIAS" },
  { fitid: "T8", dt: "20240615", valor: "-75.00", memo: "QA-C 2026-10-12 T8 SEMPAR-TIPO" },
  { fitid: "T9", dt: "20240628", valor: "33.33", memo: "QA-C 2026-10-12 T9 SEMPAR" },
  { fitid: "T10", dt: "20240605", valor: "-1000.00", memo: "QA-C 2026-10-12 T10 DUPLICATA DE T1" },
];

function montarOfxQaC() {
  const blocos = TRANSACOES_OFX.map(
    (tr) => `<STMTTRN>
<TRNTYPE>${Number(tr.valor) < 0 ? "DEBIT" : "CREDIT"}
<DTPOSTED>${tr.dt}
<TRNAMT>${tr.valor}
<FITID>${tr.fitid}
<MEMO>${tr.memo}
</STMTTRN>`,
  ).join("\n");
  return `OFXHEADER:100
DATA:OFXSGML
VERSION:102
CHARSET:1252

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<CURDEF>BRL
<BANKACCTFROM>
<BANKID>0237
<ACCTID>98765-4
</BANKACCTFROM>
<BANKTRANLIST>
${blocos}
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;
}

// Lançamentos do relatório (o dia exato de cada um, d05, d10..., também vem dele): "AUTO1 deb 1.000,00 d05 · AUTO2 créd 2.450,50 d10 · AUTO3 deb 106,01 d12 ·
// PROV1 créd 890,15 d16 · PROV2 deb 42,90 d20 · PROV3 créd 1.180,00 d21 · SEMPAR-4DIAS deb 300,00 d01 ·
// SEMPAR-TIPO créd 75,00 d15 · SEMPAR-SOLO deb 5,55 d26" (junho/2024).
const LANCAMENTOS = [
  { id: "AUTO1", tipo: "debito", valor: 1000.0, data_lancamento: "2024-06-05", descricao: "QA-C 2026-10-12 AUTO1" },
  { id: "AUTO2", tipo: "credito", valor: 2450.5, data_lancamento: "2024-06-10", descricao: "QA-C 2026-10-12 AUTO2" },
  { id: "AUTO3", tipo: "debito", valor: 106.01, data_lancamento: "2024-06-12", descricao: "QA-C 2026-10-12 AUTO3" },
  { id: "PROV1", tipo: "credito", valor: 890.15, data_lancamento: "2024-06-16", descricao: "QA-C 2026-10-12 PROV1" },
  { id: "PROV2", tipo: "debito", valor: 42.9, data_lancamento: "2024-06-20", descricao: "QA-C 2026-10-12 PROV2" },
  { id: "PROV3", tipo: "credito", valor: 1180.0, data_lancamento: "2024-06-21", descricao: "QA-C 2026-10-12 PROV3" },
  { id: "SEMPAR-4DIAS", tipo: "debito", valor: 300.0, data_lancamento: "2024-06-01", descricao: "QA-C 2026-10-12 SEMPAR-4DIAS" },
  { id: "SEMPAR-TIPO", tipo: "credito", valor: 75.0, data_lancamento: "2024-06-15", descricao: "QA-C 2026-10-12 SEMPAR-TIPO" },
  { id: "SEMPAR-SOLO", tipo: "debito", valor: 5.55, data_lancamento: "2024-06-26", descricao: "QA-C 2026-10-12 SEMPAR-SOLO" },
];

// O que o banco guardaria: a transação do OFX com o FITID como id (basta para o matching).
function transacoesDoOfx() {
  const { transacoes } = parseOfx(decodificarOfx(Buffer.from(montarOfxQaC(), "latin1")));
  return transacoes.map((tr) => ({ ...tr, id: tr.id_banco }));
}

describe("dataset QA-C 2026-10-12 — leitura do OFX", () => {
  it("lê as 10 transações, banco 0237, período junho/2024, com acento e fuso certos", () => {
    const { banco, transacoes } = parseOfx(decodificarOfx(Buffer.from(montarOfxQaC(), "latin1")));
    assert.equal(banco, "0237");
    assert.equal(transacoes.length, 10);
    assert.deepEqual(inferirMesAno(transacoes), { mes: 6, ano: 2024 });
    const t4 = transacoes.find((tr) => tr.id_banco === "T4");
    assert.equal(t4.data_lancamento, "2024-06-18", "fuso [-3:BRT] não desloca a data");
    assert.match(t4.descricao, /AÇÃO/, "Windows-1252 decodificado");
    assert.deepEqual(
      transacoes.map((tr) => [tr.id_banco, tr.tipo, tr.valor]),
      [
        ["T1", "debito", 1000], ["T2", "credito", 2450.5], ["T3", "debito", 106], ["T4", "credito", 890.15],
        ["T5", "debito", 42.9], ["T6", "credito", 1180], ["T7", "debito", 300], ["T8", "debito", 75],
        ["T9", "credito", 33.33], ["T10", "debito", 1000],
      ],
    );
  });
});

describe("dataset QA-C 2026-10-12 — matching: 3 automáticos / 3 prováveis / 4+3 sem par", () => {
  const transacoes = transacoesDoOfx();
  const pares = executarMatching(transacoes, LANCAMENTOS);
  const doTipo = (confianca) => pares.filter((p) => p.confianca === confianca);

  it("3 automáticos: AUTO2/T2, AUTO3/T3 (R$ 0,01 de diferença) e AUTO1 com T1 ou T10", () => {
    const automaticos = doTipo("automatico");
    assert.equal(automaticos.length, 3);
    assert.ok(automaticos.some((p) => p.lancamento_id === "AUTO2" && p.transacao_id === "T2"));
    assert.ok(automaticos.some((p) => p.lancamento_id === "AUTO3" && p.transacao_id === "T3"));
    // T10 é duplicata exata de T1: qual das duas casa com AUTO1 é a pergunta em aberto (PRB-C-34).
    const auto1 = automaticos.find((p) => p.lancamento_id === "AUTO1");
    assert.ok(["T1", "T10"].includes(auto1.transacao_id));
  });

  it("3 prováveis: PROV1/T4 (Δ2 dias), PROV2/T5 (Δ3 dias), PROV3/T6 (Δ2 dias)", () => {
    const provaveis = doTipo("provavel");
    assert.equal(provaveis.length, 3);
    for (const [lancamento, transacao] of [["PROV1", "T4"], ["PROV2", "T5"], ["PROV3", "T6"]]) {
      assert.ok(
        provaveis.some((p) => p.lancamento_id === lancamento && p.transacao_id === transacao),
        `esperava provável ${lancamento}/${transacao}`,
      );
    }
  });

  it("sem par: 4 transações (T7 Δ4 dias, T8 tipo oposto, T9, e T1 ou T10 duplicata) e 3 lançamentos", () => {
    const semPar = doTipo("sem_par");
    const transacoesSemPar = semPar.filter((p) => p.transacao_id).map((p) => p.transacao_id);
    const lancamentosSemPar = semPar.filter((p) => p.lancamento_id).map((p) => p.lancamento_id);

    assert.equal(transacoesSemPar.length, 4);
    for (const id of ["T7", "T8", "T9"]) assert.ok(transacoesSemPar.includes(id), `${id} sem par`);
    const duplicataQueSobrou = transacoesSemPar.filter((id) => id === "T1" || id === "T10");
    assert.equal(duplicataQueSobrou.length, 1, "exatamente uma das duas duplicatas sobra");

    assert.deepEqual([...lancamentosSemPar].sort(), ["SEMPAR-4DIAS", "SEMPAR-SOLO", "SEMPAR-TIPO"]);
    // Os sem par de transação não carregam lançamento, e vice-versa.
    assert.ok(semPar.every((p) => !(p.transacao_id && p.lancamento_id)));
  });

  it("total: 10 transações e 9 lançamentos geram 13 pares; ninguém aparece em dois pares", () => {
    // 3 + 3 pares casados + 4 transações sem par + 3 lançamentos sem par.
    assert.equal(pares.length, 13);
    const idsT = pares.map((p) => p.transacao_id).filter(Boolean);
    const idsL = pares.map((p) => p.lancamento_id).filter(Boolean);
    assert.equal(idsT.length, 10);
    assert.equal(idsL.length, 9);
    assert.equal(new Set(idsT).size, 10);
    assert.equal(new Set(idsL).size, 9);
  });
});

// Decisões do contador na revisão, como o controller as grava (conciliacoes.controller.js,
// confirmarPar/rejeitarPar): confirmar seta confirmado_em no par provável; rejeitar desfaz o par
// em dois pares sem_par (um só com a transação e outro só com o lançamento).
function aplicarDecisoes(pares, { confirmar, rejeitar }) {
  const resultado = [];
  for (const par of pares) {
    if (par.confianca === "provavel" && confirmar.includes(par.lancamento_id)) {
      resultado.push({ ...par, confirmado_em: "2024-07-01T12:00:00.000Z" });
    } else if (par.confianca === "provavel" && rejeitar.includes(par.lancamento_id)) {
      resultado.push({ transacao_id: par.transacao_id, lancamento_id: null, confianca: "sem_par", confirmado_em: null });
      resultado.push({ transacao_id: null, lancamento_id: par.lancamento_id, confianca: "sem_par", confirmado_em: null });
    } else {
      resultado.push({ ...par, confirmado_em: par.confirmado_em ?? null });
    }
  }
  return resultado;
}

describe("dataset QA-C 2026-10-12 — relatório depois de confirmar PROV1+PROV2 e rejeitar PROV3", () => {
  const transacoes = transacoesDoOfx();
  const paresFinais = aplicarDecisoes(executarMatching(transacoes, LANCAMENTOS), {
    confirmar: ["PROV1", "PROV2"],
    rejeitar: ["PROV3"],
  });
  const transacoesPorId = Object.fromEntries(transacoes.map((tr) => [tr.id, tr]));
  const lancamentosPorId = Object.fromEntries(LANCAMENTOS.map((lc) => [lc.id, lc]));
  const conteudo = montarConteudoRelatorio(paresFinais, transacoesPorId, lancamentosPorId);

  it("totais: 10 transações / 5 conciliadas (50%) / 5 pendentes / 4 lançamentos sem par", () => {
    assert.equal(conteudo.totais.totalTransacoes, 10);
    assert.equal(conteudo.totais.totalConciliadas, 5);
    assert.equal(conteudo.totais.totalConciliadas / conteudo.totais.totalTransacoes, 0.5);
    assert.equal(conteudo.totais.totalTransacoesPendentes, 5);
    assert.equal(conteudo.totais.totalLancamentosSemPar, 4);
  });

  it("valor conciliado R$ 4.489,55 = 1000 + 2450,50 + 106,00 + 890,15 + 42,90", () => {
    // 106,00 é o valor da transação do extrato (T3), não os 106,01 do lançamento AUTO3.
    assert.equal(conteudo.totais.valorTotalConciliado, 4489.55);
    assert.equal(formatarMoeda(conteudo.totais.valorTotalConciliado), "R$ 4.489,55");
  });

  it("matches em ordem cronológica: 05, 10, 12, 17 (T5 com PROV2) e 18 (T4 com PROV1)", () => {
    assert.deepEqual(conteudo.matches.map((m) => m.data), [
      "2024-06-05", "2024-06-10", "2024-06-12", "2024-06-17", "2024-06-18",
    ]);
    assert.deepEqual(conteudo.matches.map((m) => m.valor), [1000, 2450.5, 106, 42.9, 890.15]);
  });

  it("itens sem par: 9 linhas em ordem cronológica, banco e lançamento interno intercalados", () => {
    // 5 transações (T6, T7, T8, T9 e a duplicata) + 4 lançamentos (PROV3 e os 3 SEMPAR).
    assert.equal(conteudo.semPar.length, 9);
    const datas = conteudo.semPar.map((i) => i.data);
    assert.deepEqual(datas, [...datas].sort());
    assert.equal(conteudo.semPar.filter((i) => i.origem === "banco").length, 5);
    assert.equal(conteudo.semPar.filter((i) => i.origem === "lancamento_interno").length, 4);
  });

  it("a rejeição de PROV3 devolve o lançamento à lista de sem par (não some, QA-C 09-20 #2)", () => {
    assert.ok(conteudo.semPar.some((i) => i.descricao.includes("PROV3") && i.origem === "lancamento_interno"));
  });

  it("sem decidir nada, os 3 prováveis ficam fora: 3 conciliadas (automáticos) e R$ 3.556,50", () => {
    // Prova de que o 5 vem das decisões: antes de confirmar só os automáticos contam
    // (1000 + 2450,50 + 106,00 = 3.556,50).
    const semDecisao = montarConteudoRelatorio(
      executarMatching(transacoes, LANCAMENTOS).map((p) => ({ ...p, confirmado_em: null })),
      transacoesPorId,
      lancamentosPorId,
    );
    assert.equal(semDecisao.totais.totalConciliadas, 3);
    assert.equal(semDecisao.totais.totalTransacoesPendentes, 7);
    assert.equal(semDecisao.totais.valorTotalConciliado, 3556.5);
  });

  describe("PDF gerado", () => {
    // Grava cada doc.text(...) com posição para conferir o conteúdo desenhado sem depender de
    // biblioteca de extração de texto (o backend só tem pdfkit).
    async function textosDoPdf() {
      const textos = [];
      const original = PDFDocument.prototype.text;
      PDFDocument.prototype.text = function (texto, ...resto) {
        textos.push(String(texto));
        return original.call(this, texto, ...resto);
      };
      let buffer;
      try {
        buffer = await gerarRelatorioConciliacaoPDF({
          cliente: "Cliente QA-C",
          banco: "0237",
          conta: "7654",
          mes: 6,
          ano: 2024,
          geradoEm: new Date(2024, 6, 1, 10, 0),
          ...conteudo,
        });
      } finally {
        PDFDocument.prototype.text = original;
      }
      return { textos, buffer };
    }

    it("mostra 10 / 5 / 5 / 4 e R$ 4.489,55 nas células de totais", async () => {
      const { textos, buffer } = await textosDoPdf();
      assert.equal(buffer.subarray(0, 4).toString("ascii"), "%PDF");
      // O rótulo vem antes do valor em cada célula (desenharCelula).
      const valorDe = (rotulo) => textos[textos.indexOf(rotulo) + 1];
      assert.equal(valorDe("TOTAL TRANSAÇÕES"), "10");
      assert.equal(valorDe("CONCILIADAS"), "5");
      assert.equal(valorDe("TRANSAÇÕES PENDENTES"), "5");
      assert.equal(valorDe("LANÇAMENTOS SEM PAR"), "4");
      assert.equal(valorDe("VALOR TOTAL CONCILIADO"), "R$ 4.489,55");
    });

    it("datas em dd/mm/aaaa e valores em R$ pt-BR nas linhas das tabelas", async () => {
      const { textos } = await textosDoPdf();
      for (const esperado of ["05/06/2024", "R$ 1.000,00", "R$ 2.450,50", "R$ 106,00", "R$ 890,15", "R$ 42,90", "R$ 5,55"]) {
        assert.ok(textos.includes(esperado), `PDF sem "${esperado}"`);
      }
    });

    it("matches aparecem na ordem cronológica dentro do PDF", async () => {
      const { textos } = await textosDoPdf();
      const posicoes = ["R$ 1.000,00", "R$ 2.450,50", "R$ 106,00", "R$ 42,90", "R$ 890,15"].map((v) => textos.indexOf(v));
      assert.ok(posicoes.every((p) => p >= 0));
      assert.deepEqual(posicoes, [...posicoes].sort((a, b) => a - b));
    });
  });
});
