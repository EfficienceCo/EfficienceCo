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
