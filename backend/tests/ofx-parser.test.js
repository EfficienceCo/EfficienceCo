import { describe, it } from "node:test";
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
