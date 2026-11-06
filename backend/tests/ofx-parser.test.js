import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { mascararConta, nomeBanco } from "../src/utils/banco-conta.util.js";
import { parseOfx, decodificarOfx, OfxParseError, inferirMesAno, periodosDoExtrato } from "../src/utils/ofx-parser.util.js";
import { DESCRICAO_MAXIMO } from "../src/utils/texto-conciliacao.util.js";

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

  // PRB-C-33 / BUG-CONC-17 (#694). O calendário e o NUMERIC(15,2) recusam
  // antes do INSERT; a mensagem aponta a transação (ou o FITID) e o valor.
  function assertRecusa(conteudo, trechos) {
    assert.throws(
      () => parseOfx(conteudo),
      (erro) => {
        assert.ok(erro instanceof OfxParseError);
        for (const trecho of trechos) {
          assert.ok(erro.message.includes(trecho), erro.message);
        }
        return true;
      },
    );
  }

  it("recusa DTPOSTED 20241345 e aponta a transação e o valor", () => {
    const conteudo = extratoComTransacoes(`<STMTTRN>
<DTPOSTED>20241345
<TRNAMT>10.00
<FITID>D13
</STMTTRN>`);

    assertRecusa(conteudo, ["20241345", "transação #1", "FITID D13"]);
  });

  it("recusa DTPOSTED 20240230 sem devolver a transação anterior", () => {
    const conteudo = extratoComTransacoes(`<STMTTRN>
<DTPOSTED>20240201
<TRNAMT>10.00
<FITID>OK
</STMTTRN>
<STMTTRN>
<DTPOSTED>20240230
<TRNAMT>20.00
<FITID>FEV
</STMTTRN>`);

    assertRecusa(conteudo, ["20240230", "transação #2", "FITID FEV"]);
  });

  it("recusa TRNAMT 1e15 fora da faixa", () => {
    const conteudo = extratoComTransacoes(`<STMTTRN>
<DTPOSTED>20240201
<TRNAMT>1e15
<FITID>V1
</STMTTRN>`);

    assertRecusa(conteudo, ["1e15", "transação #1", "FITID V1"]);
  });

  it("recusa TRNAMT negativo cujo absoluto estoura a faixa", () => {
    const conteudo = extratoComTransacoes(`<STMTTRN>
<DTPOSTED>20240201
<TRNAMT>-1e15
<FITID>V1N
</STMTTRN>`);

    assertRecusa(conteudo, ["-1e15", "FITID V1N"]);
  });

  it("recusa TRNAMT 99999999999999.99 fora da faixa", () => {
    const conteudo = extratoComTransacoes(`<STMTTRN>
<DTPOSTED>20240201
<TRNAMT>99999999999999.99
<FITID>V2
</STMTTRN>`);

    assertRecusa(conteudo, ["99999999999999.99", "transação #1", "FITID V2"]);
  });

  it("aceita 29 de fevereiro em ano bissexto e o teto do NUMERIC(15,2)", () => {
    const conteudo = extratoComTransacoes(`<STMTTRN>
<DTPOSTED>20240229
<TRNAMT>-9999999999999.99
<FITID>TETO
</STMTTRN>`);

    const { transacoes } = parseOfx(conteudo);
    assert.equal(transacoes[0].data_lancamento, "2024-02-29");
    assert.equal(transacoes[0].valor, 9999999999999.99);
    assert.equal(transacoes[0].tipo, "debito");
  });

  // PRB-C-07 / BUG-CONC-20 (#697). MEMO vira a descrição da transação.
  it("recusa MEMO de 5.000 caracteres e aponta a transação", () => {
    const conteudo = extratoComTransacoes(`<STMTTRN>
<DTPOSTED>20240201
<TRNAMT>10.00
<FITID>OK
<MEMO>OK
</STMTTRN>
<STMTTRN>
<DTPOSTED>20240202
<TRNAMT>20.00
<FITID>LONGO
<MEMO>${"x".repeat(5_000)}
</STMTTRN>`);

    assertRecusa(conteudo, ["MEMO", "5000", "transação #2", "FITID LONGO", String(DESCRICAO_MAXIMO)]);
  });

  it("aceita MEMO no teto e ignora NAME longo quando o MEMO cabe", () => {
    const memo = "m".repeat(DESCRICAO_MAXIMO);
    const conteudo = extratoComTransacoes(`<STMTTRN>
<DTPOSTED>20240201
<TRNAMT>10.00
<FITID>TETO
<NAME>${"n".repeat(5_000)}
<MEMO>${memo}
</STMTTRN>`);

    const { transacoes } = parseOfx(conteudo);
    assert.equal(transacoes[0].descricao, memo);
  });

  it("recusa NAME acima do teto quando o MEMO está ausente", () => {
    const conteudo = extratoComTransacoes(`<STMTTRN>
<DTPOSTED>20240201
<TRNAMT>-10.00
<FITID>NOME
<NAME>${"n".repeat(DESCRICAO_MAXIMO + 1)}
</STMTTRN>`);

    assertRecusa(conteudo, ["NAME", "transação #1", "FITID NOME"]);
  });
  // PRB-C-35 / BUG-CONC-23 (#700). slice(-4) contava o hífen e "98765-4" virava "65-4".
  it("conta mascarada mantém os 4 últimos dígitos (98765-4 → …7654) (PRB-C-35, #700)", () => {
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

    const { banco, conta } = parseOfx(conteudo);
    assert.equal(banco, "0237");
    assert.equal(conta, "7654");
    assert.ok(conta.replace(/\D/g, "").endsWith("7654"), `conta: ${conta}`);
  });
});

describe("mascararConta e nomeBanco", () => {
  it("não descarta dígito quando a conta tem hífen ou menos de 4 dígitos", () => {
    assert.equal(mascararConta("98765-4"), "7654");
    assert.equal(mascararConta("12.345-6"), "3456");
    assert.equal(mascararConta("1234567890"), "7890");
    assert.equal(mascararConta("555"), "555");
    assert.equal(mascararConta("12-3"), "123");
    assert.equal(mascararConta("ABCD"), "ABCD");
    assert.equal(mascararConta("  "), null);
    assert.equal(mascararConta(null), null);
  });

  it("mostra o nome quando o código COMPE é conhecido e o código quando não é", () => {
    assert.equal(nomeBanco("0237"), "Bradesco");
    assert.equal(nomeBanco("237"), "Bradesco");
    assert.equal(nomeBanco("0341"), "Itaú");
    assert.equal(nomeBanco("999"), "999");
    assert.equal(nomeBanco("0999"), "0999");
    assert.equal(nomeBanco("1234"), "1234");
    assert.equal(nomeBanco("Itaú"), "Itaú");
    assert.equal(nomeBanco(""), "");
    assert.equal(nomeBanco(null), "");
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

  it("em empate fica com o primeiro mês que aparece no arquivo", () => {
    const resultado = periodosDoExtrato([
      { data_lancamento: "2026-03-10" },
      { data_lancamento: "2026-01-05" },
      { data_lancamento: "2026-01-20" },
      { data_lancamento: "2026-03-15" },
    ]);

    assert.equal(resultado.empate, true);
    assert.equal(resultado.mes, 3);
    assert.equal(resultado.ano, 2026);
    assert.deepEqual(inferirMesAno([
      { data_lancamento: "2026-03-10" },
      { data_lancamento: "2026-01-05" },
      { data_lancamento: "2026-01-20" },
      { data_lancamento: "2026-03-15" },
    ]), { mes: 3, ano: 2026 });
  });
});

describe("parseOfx: FITID e valor zero (#692)", () => {
  const trn = (fitid, valor) => `<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260705
<TRNAMT>${valor}
${fitid === null ? "" : `<FITID>${fitid}\n`}<MEMO>M
</STMTTRN>`;

  it("ignora transação de valor 0 e conta quantas ignorou", () => {
    const r = parseOfx(extratoComTransacoes([trn("A", "10.00"), trn("B", "0.00"), trn("C", "-0")].join("\n")));
    assert.deepEqual(r.transacoes.map((t) => t.id_banco), ["A"]);
    assert.equal(r.ignoradas_valor_zero, 2);
  });

  it("recusa o arquivo quando todas as transações têm valor 0", () => {
    assert.throws(
      () => parseOfx(extratoComTransacoes([trn("A", "0.00"), trn("B", "0")].join("\n"))),
      (e) => e instanceof OfxParseError && /valor zero/.test(e.message),
    );
  });

  it("recusa FITID repetido no mesmo arquivo, citando o FITID", () => {
    assert.throws(
      () => parseOfx(extratoComTransacoes([trn("DUP1", "10.00"), trn("OK", "20.00"), trn("DUP1", "30.00")].join("\n"))),
      (e) => e instanceof OfxParseError && /FITID repetido no arquivo: "DUP1"/.test(e.message),
    );
  });

  it("não trata FITID ausente como repetido", () => {
    const r = parseOfx(extratoComTransacoes([trn(null, "10.00"), trn(null, "20.00")].join("\n")));
    assert.equal(r.transacoes.length, 2);
    assert.equal(r.transacoes[0].id_banco, null);
  });

  it("FITID repetido só entre linha de valor 0 e linha válida não derruba o arquivo", () => {
    const r = parseOfx(extratoComTransacoes([trn("X", "0.00"), trn("X", "15.00")].join("\n")));
    assert.deepEqual(r.transacoes.map((t) => t.valor), [15]);
  });
});
describe("parseOfx: arredondamento e identidade (#692)", () => {
  const trn = (valor) => `<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260705
<TRNAMT>${valor}
<FITID>F${valor}
<MEMO>M
</STMTTRN>`;

  it("arredonda para centavos e ignora o que dá 0.00 (0.004, -0.004)", () => {
    const r = parseOfx(extratoComTransacoes([trn("0.004"), trn("-0.004"), trn("10.126")].join("\n")));
    assert.deepEqual(r.transacoes.map((t) => t.valor), [10.13]);
    assert.equal(r.ignoradas_valor_zero, 2);
  });

  it("recusa o arquivo quando tudo arredonda para zero", () => {
    assert.throws(
      () => parseOfx(extratoComTransacoes([trn("0.004"), trn("0.001")].join("\n"))),
      (e) => e instanceof OfxParseError && /valor zero/.test(e.message),
    );
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

  // regressão de #694: DTPOSTED impossível passa no parser (só confere 8 dígitos) e estoura no
  // banco, virando 500 genérico. O certo é 422 com o motivo, ou seja, OfxParseError.
  // Origem: QA-C 2026-10-12 #3; 20241345 e 20240230 já estão cobertos na seção #694 acima.
  it("DTPOSTED impossível (20240631, 20240001) é recusado com OfxParseError (PRB-C-33, #694)", () => {
    for (const dtposted of ["20240631", "20240001"]) {
      assert.throws(
        () => parseOfx(extratoComTransacoes(transacaoOfx({ dtposted, trnamt: "-10.00" }))),
        OfxParseError,
        `DTPOSTED ${dtposted} deveria ser recusado`,
      );
    }
  });
});
