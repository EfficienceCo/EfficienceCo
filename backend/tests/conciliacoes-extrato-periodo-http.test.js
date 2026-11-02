import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import jwt from "jsonwebtoken";
import supabase from "../src/config/database.js";
import app from "../src/app.js";
import { PERFIS } from "../src/config/perfis.js";

const CLIENTE_ID = "11111111-1111-1111-1111-111111111111";
const EXTRATO_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

process.env.JWT_SECRET ??= "conciliacoes-periodo-extrato-test-secret";

const originalFrom = supabase.from;

let server;
let baseUrl;

before(
  () =>
    new Promise((resolve) => {
      server = createServer(app);
      server.listen(0, "127.0.0.1", () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    }),
);

after(async () => {
  supabase.from = originalFrom;
  await new Promise((resolve) => server.close(resolve));
});

function ofx({ transacoes }) {
  const linhas = transacoes
    .map(
      (t) => `<STMTTRN>
<TRNTYPE>${t.trntype}
<DTPOSTED>${t.dtposted}
<TRNAMT>${t.trnamt}
<FITID>${t.fitid}
<MEMO>${t.memo}
</STMTTRN>`,
    )
    .join("\n");

  return `OFXHEADER:100
DATA:OFXSGML
VERSION:102

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<CURDEF>BRL
<BANKACCTFROM>
<BANKID>0341
<ACCTID>1234567890
</BANKACCTFROM>
<BANKTRANLIST>
${linhas}
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;
}

function ofxJunho2024() {
  return ofx({
    transacoes: [
      { fitid: "J1", dtposted: "20240605", trnamt: "-150.00", memo: "BOLETO", trntype: "DEBIT" },
      { fitid: "J2", dtposted: "20240610", trnamt: "1500.00", memo: "DEPOSITO", trntype: "CREDIT" },
    ],
  });
}

function tokenValido() {
  return jwt.sign(
    { id: "usuario-teste", perfil: PERFIS.ADMIN_CLIENTE, cliente_id: CLIENTE_ID },
    process.env.JWT_SECRET,
  );
}

function bloquearBanco() {
  supabase.from = () => {
    throw new Error("fora de faixa não deve consultar o banco");
  };
}

async function postExtrato(campos, arquivo) {
  const form = new FormData();
  form.append("arquivo", new Blob([arquivo]), "extrato.ofx");
  for (const [chave, valor] of Object.entries(campos)) {
    form.append(chave, String(valor));
  }

  const resposta = await fetch(`${baseUrl}/conciliacoes/extrato`, {
    method: "POST",
    headers: { authorization: `Bearer ${tokenValido()}` },
    body: form,
  });

  return { status: resposta.status, body: await resposta.json() };
}

describe("POST /conciliacoes/extrato — período (HTTP)", () => {
  it("400 por campo para mes=13, mes=abc, ano=1800 e ano=2019, sem consultar o banco", async () => {
    bloquearBanco();

    const casos = [
      { campos: { mes: "13", ano: "2024" }, campo: "mes", trecho: /1 e 12/ },
      { campos: { mes: "abc", ano: "2024" }, campo: "mes", trecho: /1 e 12/ },
      { campos: { mes: "6", ano: "1800" }, campo: "ano", trecho: /2020 e 9999/ },
      { campos: { mes: "6", ano: "2019" }, campo: "ano", trecho: /2020 e 9999/ },
    ];

    for (const caso of casos) {
      const resposta = await postExtrato(caso.campos, ofxJunho2024());
      assert.equal(resposta.status, 400, JSON.stringify(caso.campos));
      assert.match(resposta.body.campos[caso.campo], caso.trecho, JSON.stringify(resposta.body));
    }
  });

  it("400 ao informar abril para o OFX de junho e não deixa o arquivo preso", async () => {
    const chamadas = [];
    supabase.from = (tabela) => {
      const builder = {
        insert() {
          chamadas.push(tabela);
          return builder;
        },
        update(payload) {
          chamadas.push({ tabela, payload });
          return builder;
        },
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        single() {
          return Promise.resolve({ data: { id: EXTRATO_ID, cliente_id: CLIENTE_ID }, error: null });
        },
        then(resolve, reject) {
          return Promise.resolve({ data: null, error: null }).then(resolve, reject);
        },
      };
      return builder;
    };

    const resposta = await postExtrato({ mes: "4", ano: "2024" }, ofxJunho2024());

    assert.equal(resposta.status, 400);
    assert.match(resposta.body.erro, /período do arquivo: 6\/2024/);
    const recusa = chamadas.find((chamada) => chamada.payload);
    assert.equal(recusa.tabela, "extratos_bancarios");
    assert.equal(recusa.payload.status, "erro");
    assert.equal(recusa.payload.arquivo_hash, null);
    assert.equal(
      chamadas.some((chamada) => chamada === "transacoes_extrato"),
      false,
    );
  });
});
