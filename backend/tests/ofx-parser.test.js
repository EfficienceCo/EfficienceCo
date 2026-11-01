import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseOfx, decodificarOfx, OfxParseError, inferirMesAno, periodosDoExtrato } from "../src/utils/ofx-parser.util.js";

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
