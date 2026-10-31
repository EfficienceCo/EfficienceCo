import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { parseOfx, decodificarOfx, OfxParseError, inferirMesAno } from "../src/utils/ofx-parser.util.js";

function ofx(corpo) {
  return `OFXHEADER:100
DATA:OFXSGML
VERSION:102

<OFX>
${corpo}
</OFX>`;
}

const CABECALHO_PADRAO = `<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<CURDEF>BRL
<BANKACCTFROM>
<BANKID>0341
<ACCTID>1234567890
</BANKACCTFROM>
<BANKTRANLIST>`;

const RODAPE_PADRAO = `</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>`;

function extratoComTransacoes(linhasTransacoes) {
  return ofx(`${CABECALHO_PADRAO}\n${linhasTransacoes}\n${RODAPE_PADRAO}`);
}

describe("parseOfx", () => {
  it("parseia campos básicos de uma transação (padrão SGML sem fechamento de tag)", () => {
    const conteudo = extratoComTransacoes(`<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260705120000[-3:BRT]
<TRNAMT>-150.00
<FITID>202607050001
<MEMO>PAGAMENTO BOLETO
</STMTTRN>`);

    const resultado = parseOfx(conteudo);

    assert.equal(resultado.banco, "0341");
    assert.equal(resultado.conta, "7890");
    assert.equal(resultado.transacoes.length, 1);
    assert.deepEqual(resultado.transacoes[0], {
      data_lancamento: "2026-07-05",
      valor: 150,
      tipo: "debito",
      descricao: "PAGAMENTO BOLETO",
      id_banco: "202607050001",
    });
  });

  it("infere crédito quando TRNAMT é positivo", () => {
    const conteudo = extratoComTransacoes(`<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260710
<TRNAMT>1500.00
<FITID>T2
<MEMO>DEPOSITO
</STMTTRN>`);

    const { transacoes } = parseOfx(conteudo);
    assert.equal(transacoes[0].tipo, "credito");
    assert.equal(transacoes[0].valor, 1500);
  });

  it("usa NAME quando MEMO está ausente", () => {
    const conteudo = extratoComTransacoes(`<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260710
<TRNAMT>10.00
<FITID>T3
<NAME>TRANSFERENCIA RECEBIDA
</STMTTRN>`);

    const { transacoes } = parseOfx(conteudo);
    assert.equal(transacoes[0].descricao, "TRANSFERENCIA RECEBIDA");
  });

  it("usa BRANCHID quando BANKID está ausente", () => {
    const conteudo = ofx(`<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKACCTFROM>
<BRANCHID>1234
<ACCTID>555
</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN>
<DTPOSTED>20260701
<TRNAMT>5.00
<FITID>T1
<MEMO>X
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>`);

    const resultado = parseOfx(conteudo);
    assert.equal(resultado.banco, "1234");
  });

  it("lança OfxParseError quando o arquivo não tem tag <OFX>", () => {
    assert.throws(() => parseOfx("isso não é um OFX"), OfxParseError);
  });

  it("lança OfxParseError quando não há transações", () => {
    const conteudo = ofx(`${CABECALHO_PADRAO}\n${RODAPE_PADRAO}`);
    assert.throws(() => parseOfx(conteudo), OfxParseError);
  });

  it("lança OfxParseError quando falta o cabeçalho do banco", () => {
    const conteudo = ofx(`<BANKTRANLIST>
<STMTTRN>
<DTPOSTED>20260701
<TRNAMT>5.00
<FITID>T1
</STMTTRN>
</BANKTRANLIST>`);

    assert.throws(() => parseOfx(conteudo), OfxParseError);
  });

  it("lança OfxParseError quando TRNAMT está ausente numa transação", () => {
    const conteudo = extratoComTransacoes(`<STMTTRN>
<DTPOSTED>20260701
<FITID>T1
<MEMO>SEM VALOR
</STMTTRN>`);

    assert.throws(() => parseOfx(conteudo), OfxParseError);
  });

  it("lança OfxParseError quando DTPOSTED está malformado", () => {
    const conteudo = extratoComTransacoes(`<STMTTRN>
<DTPOSTED>data-invalida
<TRNAMT>5.00
<FITID>T1
</STMTTRN>`);

    assert.throws(() => parseOfx(conteudo), OfxParseError);
  });
});

describe("decodificarOfx", () => {
  it("decodifica como latin1 quando CHARSET:1252 (padrão de bancos BR)", () => {
    const conteudo = "OFXHEADER:100\nCHARSET:1252\n\n<OFX><MEMO>CONDOMÍNIO - PAGAMENTO À VISTA</OFX>";
    const buffer = Buffer.from(conteudo, "latin1");

    assert.equal(decodificarOfx(buffer), conteudo);
  });

  it("decodifica como latin1 quando nenhum CHARSET é declarado", () => {
    const conteudo = "OFXHEADER:100\n\n<OFX><MEMO>MANUTENÇÃO</OFX>";
    const buffer = Buffer.from(conteudo, "latin1");

    assert.equal(decodificarOfx(buffer), conteudo);
  });

  it("decodifica como utf-8 quando CHARSET:UTF-8 é declarado explicitamente", () => {
    const conteudo = "OFXHEADER:100\nCHARSET:UTF-8\n\n<OFX><MEMO>MANUTENÇÃO</OFX>";
    const buffer = Buffer.from(conteudo, "utf-8");

    assert.equal(decodificarOfx(buffer), conteudo);
  });
});

describe("inferirMesAno", () => {
  it("retorna o mes/ano mais frequente entre as transações", () => {
    const resultado = inferirMesAno([
      { data_lancamento: "2026-07-31" },
      { data_lancamento: "2026-08-01" },
      { data_lancamento: "2026-08-15" },
    ]);

    assert.deepEqual(resultado, { mes: 8, ano: 2026 });
  });
});

// ---------------------------------------------------------------------------
// Problemas já achados (catálogo do TEST-7, vault: referencias/catalogo-problemas-viram-teste-2026-10)
// ---------------------------------------------------------------------------

describe("parseOfx — problemas já achados", () => {
  // PRB-C-36 (baseline do QA-C 10-12): banco BR exporta TRNAMT com vírgula decimal.
  it("aceita TRNAMT com vírgula decimal (-1234,56)", () => {
    const resultado = parseOfx(extratoComTransacoes(`<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260705
<TRNAMT>-1234,56
<FITID>V1
<MEMO>TARIFA
</STMTTRN>`));

    assert.equal(resultado.transacoes[0].valor, 1234.56);
    assert.equal(resultado.transacoes[0].tipo, "debito");
  });

  // BUG (#692): o mesmo FITID duas vezes no arquivo vira duas transações. O
  // comportamento certo ainda não foi escolhido (recusar o arquivo ou manter
  // uma só); qualquer um dos dois passa aqui, duplicar não.
  it.skip("FITID repetido no mesmo arquivo não gera duas transações (PRB-C-12, #692)", () => {
    const conteudo = extratoComTransacoes(["100.00", "100.00"].map((valor) => `<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260705
<TRNAMT>${valor}
<FITID>REPETIDO
<MEMO>PIX
</STMTTRN>`).join("\n"));

    let resultado;
    try {
      resultado = parseOfx(conteudo);
    } catch (erro) {
      assert.ok(erro instanceof OfxParseError);
      return;
    }
    const ids = resultado.transacoes.map((t) => t.id_banco);
    assert.equal(new Set(ids).size, ids.length);
  });

  // BUG (#692): transação de R$ 0,00 é aceita e entra no matching.
  it.skip("transação de R$ 0,00 não entra como transação (PRB-C-12, #692)", () => {
    const conteudo = extratoComTransacoes(`<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260705
<TRNAMT>0.00
<FITID>Z1
<MEMO>ESTORNO ZERADO
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260706
<TRNAMT>10.00
<FITID>Z2
<MEMO>PIX
</STMTTRN>`);

    let resultado;
    try {
      resultado = parseOfx(conteudo);
    } catch (erro) {
      assert.ok(erro instanceof OfxParseError);
      return;
    }
    assert.ok(resultado.transacoes.every((t) => t.valor > 0));
  });

  // BUG (#700): ACCTID "98765-4" vira "65-4" (slice(-4) conta o hífen). A conta
  // mascarada tem que manter os 4 últimos dígitos.
  it.skip("conta mascarada mantém os 4 últimos dígitos (98765-4 → …7654) (PRB-C-35, #700)", () => {
    const conteudo = ofx(`<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<CURDEF>BRL
<BANKACCTFROM>
<BANKID>0237
<ACCTID>98765-4
</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260705
<TRNAMT>10.00
<FITID>C1
</STMTTRN>
${RODAPE_PADRAO}`);

    const { conta } = parseOfx(conteudo);
    assert.ok(conta.replace(/\D/g, "").endsWith("7654"), `conta: ${conta}`);
  });
});

// ---------------------------------------------------------------------------
// TEST-8 (#685): bordas do OFX. Origem de cada regra: background da task TEST-8
// ("OFX de banco brasileiro vem em Windows-1252, usa o sinal do valor para
// crédito/débito (o TRNTYPE pode divergir) e a DTPOSTED pode trazer fuso
// [-3:BRT]") e a conferência do QA-C 2026-10-12 (problemas/conciliacao-qa-c-2026-10-12).
// ---------------------------------------------------------------------------

function transacaoOfx({ trntype = "DEBIT", dtposted, trnamt, fitid = "F1", memo = "MEMO" }) {
  return `<STMTTRN>
<TRNTYPE>${trntype}
<DTPOSTED>${dtposted}
<TRNAMT>${trnamt}
<FITID>${fitid}
<MEMO>${memo}
</STMTTRN>`;
}

describe("parseOfx — bordas (TEST-8)", () => {
  it("Windows-1252 com acento: bytes latin1 viram MEMO legível (QA-C T4 'AÇÃO')", () => {
    // Origem: QA-C 2026-10-12, qac.ofx com CHARSET 1252 e memo com "AÇÃO" importado certo.
    const texto = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
CHARSET:1252

<OFX>
${CABECALHO_PADRAO}
${transacaoOfx({ trntype: "CREDIT", dtposted: "20240618", trnamt: "890.15", memo: "QA-C T4 AÇÃO CONDOMÍNIO À VISTA" })}
${RODAPE_PADRAO}
</OFX>`;
    const buffer = Buffer.from(texto, "latin1");
    // Premissa: lido como UTF-8, o mesmo arquivo corrompe o acento (por isso o parser decodifica à parte).
    assert.ok(buffer.toString("utf-8").includes("�"));

    const { transacoes } = parseOfx(decodificarOfx(buffer));
    assert.equal(transacoes[0].descricao, "QA-C T4 AÇÃO CONDOMÍNIO À VISTA");
  });

  it("valor com vírgula decimal: crédito '890,15' e débito '-42,90'", () => {
    // Origem: QA-C 2026-10-12, "vírgula decimal no OFX (-1234,56) lida certo" (PRB-C-36).
    const { transacoes } = parseOfx(extratoComTransacoes([
      transacaoOfx({ trntype: "CREDIT", dtposted: "20240618", trnamt: "890,15", fitid: "A" }),
      transacaoOfx({ trntype: "DEBIT", dtposted: "20240617", trnamt: "-42,90", fitid: "B" }),
    ].join("\n")));
    assert.deepEqual(transacoes.map((t) => [t.tipo, t.valor]), [["credito", 890.15], ["debito", 42.9]]);
  });

  it("fuso no DTPOSTED não desloca o dia: 00:00 com [-3:BRT] continua no mesmo dia", () => {
    // Origem: QA-C 2026-10-12, T4 com DTPOSTED '20240618000000[-3:BRT]' ("fuso não desloca a data").
    // Converter para UTC ou para o fuso 0 mudaria o dia (00:00 BRT = 03:00 UTC; 23:59 BRT = 02:59 do dia seguinte).
    const { transacoes } = parseOfx(extratoComTransacoes([
      transacaoOfx({ dtposted: "20240618000000[-3:BRT]", trnamt: "-10.00", fitid: "A" }),
      transacaoOfx({ dtposted: "20240618235959[-3:BRT]", trnamt: "-10.00", fitid: "B" }),
      transacaoOfx({ dtposted: "20240618120000[+9:JST]", trnamt: "-10.00", fitid: "C" }),
    ].join("\n")));
    assert.deepEqual(transacoes.map((t) => t.data_lancamento), ["2024-06-18", "2024-06-18", "2024-06-18"]);
  });

  describe("TRNTYPE contra o sinal: o sinal do TRNAMT manda", () => {
    // Origem: background da TEST-8 ("usa o sinal do valor para crédito/débito; o TRNTYPE pode divergir").
    let avisos;
    beforeEach(() => {
      avisos = mock.method(console, "warn", () => {});
    });
    afterEach(() => avisos.mock.restore());

    it("TRNTYPE=CREDIT com valor negativo vira débito", () => {
      const { transacoes } = parseOfx(extratoComTransacoes(
        transacaoOfx({ trntype: "CREDIT", dtposted: "20240618", trnamt: "-50.00" })));
      assert.equal(transacoes[0].tipo, "debito");
      assert.equal(transacoes[0].valor, 50);
      assert.equal(avisos.mock.callCount(), 1, "a divergência é avisada no log");
    });

    it("TRNTYPE=DEBIT com valor positivo vira crédito", () => {
      const { transacoes } = parseOfx(extratoComTransacoes(
        transacaoOfx({ trntype: "DEBIT", dtposted: "20240618", trnamt: "50.00" })));
      assert.equal(transacoes[0].tipo, "credito");
      assert.equal(transacoes[0].valor, 50);
    });

    it("TRNTYPE coerente com o sinal não gera aviso e os dois lados coerentes mantêm o tipo", () => {
      const { transacoes } = parseOfx(extratoComTransacoes([
        transacaoOfx({ trntype: "DEBIT", dtposted: "20240618", trnamt: "-1.00", fitid: "A" }),
        transacaoOfx({ trntype: "CREDIT", dtposted: "20240618", trnamt: "1.00", fitid: "B" }),
      ].join("\n")));
      assert.deepEqual(transacoes.map((t) => t.tipo), ["debito", "credito"]);
      assert.equal(avisos.mock.callCount(), 0);
    });
  });

  it("valor sempre sai positivo e o sinal vai para o tipo (-1000.00 → débito de 1000)", () => {
    const { transacoes } = parseOfx(extratoComTransacoes(
      transacaoOfx({ dtposted: "20240605", trnamt: "-1000.00" })));
    assert.equal(transacoes[0].valor, 1000);
    assert.equal(transacoes[0].tipo, "debito");
  });

  it("TRNAMT que não é número ('abc') lança OfxParseError citando a transação", () => {
    assert.throws(
      () => parseOfx(extratoComTransacoes(transacaoOfx({ dtposted: "20240605", trnamt: "abc" }))),
      (erro) => erro instanceof OfxParseError && /transação #1/.test(erro.message),
    );
  });

  // Período do OFX incoerente (QA-C 2026-10-12 #2): a parte pura é a inferência do período
  // pelas datas; o aceite de mês/ano informado que não bate com o arquivo é do controller
  // (teste em conciliacoes.test.js, PRB-C-25, #693).
  describe("inferirMesAno — bordas", () => {
    it("QA-C 2026-10-12: as 10 transações de junho/2024 inferem 6/2024", () => {
      const dias = ["05", "10", "12", "18", "17", "23", "05", "15", "28", "05"];
      const resultado = inferirMesAno(dias.map((d) => ({ data_lancamento: `2024-06-${d}` })));
      assert.deepEqual(resultado, { mes: 6, ano: 2024 });
    });

    it("mês de dezembro e janeiro do ano seguinte: vence o mais frequente, com o ano do próprio mês", () => {
      const resultado = inferirMesAno([
        { data_lancamento: "2023-12-29" },
        { data_lancamento: "2024-01-02" },
        { data_lancamento: "2024-01-03" },
      ]);
      assert.deepEqual(resultado, { mes: 1, ano: 2024 });
    });
  });

  // BUG (#694): DTPOSTED impossível passa no parser (só confere 8 dígitos) e estoura no
  // banco, virando 500 genérico. O certo é 422 com o motivo, ou seja, OfxParseError.
  // Origem: QA-C 2026-10-12 #3 (DTPOSTED=20241345 e 20240230).
  it.skip("DTPOSTED impossível (20241345, 20240230) é recusado com OfxParseError (PRB-C-33, #694)", () => {
    for (const dtposted of ["20241345", "20240230", "20240631", "20240001"]) {
      assert.throws(
        () => parseOfx(extratoComTransacoes(transacaoOfx({ dtposted, trnamt: "-10.00" }))),
        OfxParseError,
        `DTPOSTED ${dtposted} deveria ser recusado`,
      );
    }
  });

  // BUG (#694): TRNAMT fora da faixa de NUMERIC(15,2) passa no parser e o banco recusa (500).
  // Origem: QA-C 2026-10-12 #3 (TRNAMT=1e15 e 99999999999999.99); a faixa é a da coluna
  // transacoes_extrato.valor NUMERIC(15,2) (migration 67), máximo 9.999.999.999.999,99.
  it.skip("TRNAMT fora da faixa (1e15, 99999999999999.99) é recusado com OfxParseError (PRB-C-33, #694)", () => {
    for (const trnamt of ["1e15", "99999999999999.99", "-99999999999999.99"]) {
      assert.throws(
        () => parseOfx(extratoComTransacoes(transacaoOfx({ dtposted: "20240605", trnamt }))),
        OfxParseError,
        `TRNAMT ${trnamt} deveria ser recusado`,
      );
    }
  });

  it("TRNAMT no limite da faixa (9999999999999.99) ainda é aceito", () => {
    // Máximo de NUMERIC(15,2): 13 dígitos inteiros + 2 decimais.
    const { transacoes } = parseOfx(extratoComTransacoes(
      transacaoOfx({ dtposted: "20240605", trnamt: "-9999999999999.99" })));
    assert.equal(transacoes[0].valor, 9999999999999.99);
  });
});
