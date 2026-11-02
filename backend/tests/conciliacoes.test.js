import { describe, it, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import supabase from "../src/config/database.js";
import { PERFIS } from "../src/config/perfis.js";
import {
  criarConciliacaoExtrato,
  listarTransacoesExtrato,
} from "../src/controllers/conciliacoes.controller.js";

const CLIENTE_A = "11111111-1111-1111-1111-111111111111";
const EXTRATO_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

// ---------------------------------------------------------------------------
// Mock de supabase
// ---------------------------------------------------------------------------

const originalFrom = supabase.from;
const filas = new Map();
function chave(t, m) { return `${t}:${m}`; }
function queue(tabela, metodo, resultado) {
  const k = chave(tabela, metodo);
  if (!filas.has(k)) filas.set(k, []);
  filas.get(k).push(resultado);
}

supabase.from = function (tabela) {
  const consumir = (metodo, fallback) => {
    const k = chave(tabela, metodo);
    const fila = filas.get(k);
    if (!fila || fila.length === 0) return fallback;
    return fila.shift();
  };
  const builder = {
    select() { return builder; },
    insert() { return builder; },
    update() { return builder; },
    eq() { return builder; },
    order() { return builder; },
    range() { return builder; },
    maybeSingle() { return Promise.resolve(consumir("maybeSingle", { data: null, error: null })); },
    single() { return Promise.resolve(consumir("single", { data: null, error: null })); },
    then(resolve, reject) {
      return Promise.resolve(consumir("await", { data: [], error: null })).then(resolve, reject);
    },
  };
  return builder;
};

after(() => {
  supabase.from = originalFrom;
});

beforeEach(() => filas.clear());

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function criarResposta() {
  return {
    statusCode: null,
    body: null,
    status(codigo) { this.statusCode = codigo; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

function ofxValido({ transacoes } = {}) {
  const linhasTransacoes = (transacoes ?? [
    { fitid: "T1", dtposted: "20260705", trnamt: "-150.00", memo: "PAGAMENTO BOLETO", trntype: "DEBIT" },
    { fitid: "T2", dtposted: "20260710", trnamt: "1500.00", memo: "DEPOSITO", trntype: "CREDIT" },
  ])
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
${linhasTransacoes}
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;
}

function reqUpload(overrides = {}) {
  return {
    usuario: { perfil: PERFIS.ADMIN_CLIENTE, cliente_id: CLIENTE_A },
    body: {},
    query: {},
    file: { originalname: "extrato.ofx", buffer: Buffer.from(ofxValido()) },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// POST /conciliacoes/extrato
// ---------------------------------------------------------------------------

describe("POST /conciliacoes/extrato", () => {

  it("não confunde outra violação de unicidade com arquivo duplicado", async () => {
    queue("extratos_bancarios", "single", {
      data: null,
      error: {
        code: "23505",
        message: 'duplicate key value violates unique constraint "outra_constraint"',
      },
    });

    const res = criarResposta();
    await criarConciliacaoExtrato(reqUpload(), res);

    assert.equal(res.statusCode, 500);
    assert.equal(res.body.erro, "Erro ao registrar extrato bancário");
  });

  it("500 quando a recusa do período não consegue limpar o hash", async () => {
    queue("extratos_bancarios", "single", { data: { id: EXTRATO_ID, cliente_id: CLIENTE_A }, error: null });
    queue("extratos_bancarios", "await", { data: null, error: { message: "falha ao limpar hash" } });

    const res = criarResposta();
    await criarConciliacaoExtrato(reqUpload({ body: { mes: "4", ano: "2024" } }), res);

    assert.equal(res.statusCode, 500);
    assert.equal(res.body.erro, "Erro ao registrar recusa do período do extrato");
  });

  it("500 quando falha o insert inicial de extratos_bancarios", async () => {
    queue("extratos_bancarios", "single", { data: null, error: { message: "falha de conexão" } });

    const res = criarResposta();
    await criarConciliacaoExtrato(reqUpload(), res);

    assert.equal(res.statusCode, 500);
  });

  it("500 e status='erro' quando falha o insert de transacoes_extrato", async () => {
    queue("extratos_bancarios", "single", { data: { id: EXTRATO_ID, cliente_id: CLIENTE_A }, error: null });
    queue("transacoes_extrato", "await", { data: null, error: { message: "falha ao inserir" } });

    let statusAtualizado = null;
    let hashAtualizado;
    const originalFromLocal = supabase.from;
    supabase.from = function (tabela) {
      const builder = originalFromLocal(tabela);
      if (tabela === "extratos_bancarios") {
        const updateOriginal = builder.update.bind(builder);
        builder.update = (campos) => {
          if (campos.status) statusAtualizado = campos.status;
          if (campos.status === "erro") hashAtualizado = campos.arquivo_hash;
          return updateOriginal(campos);
        };
      }
      return builder;
    };
    queue("extratos_bancarios", "await", { data: null, error: null }); // update de erro

    const res = criarResposta();
    await criarConciliacaoExtrato(reqUpload(), res);
    supabase.from = originalFromLocal;

    assert.equal(res.statusCode, 500);
    assert.equal(statusAtualizado, "erro");
    assert.equal(hashAtualizado, null);
  });

  it("500 e status='erro' quando falha o update final (transações já salvas ficam órfãs sem isso)", async () => {
    queue("extratos_bancarios", "single", { data: { id: EXTRATO_ID, cliente_id: CLIENTE_A }, error: null });
    queue("transacoes_extrato", "await", { data: [], error: null });

    let statusAtualizado = null;
    let hashAtualizado;
    const originalFromLocal = supabase.from;
    supabase.from = function (tabela) {
      const builder = originalFromLocal(tabela);
      if (tabela === "extratos_bancarios") {
        const updateOriginal = builder.update.bind(builder);
        builder.update = (campos) => {
          if (campos.status) statusAtualizado = campos.status;
          if (campos.status === "erro") hashAtualizado = campos.arquivo_hash;
          return updateOriginal(campos);
        };
      }
      return builder;
    };
    // Primeiro update (marcar como 'processado') falha; segundo update (fallback 'erro') funciona.
    queue("extratos_bancarios", "await", { data: null, error: { message: "timeout" } });
    queue("extratos_bancarios", "await", { data: null, error: null });

    const res = criarResposta();
    await criarConciliacaoExtrato(reqUpload(), res);
    supabase.from = originalFromLocal;

    assert.equal(res.statusCode, 500);
    assert.equal(statusAtualizado, "erro");
    assert.equal(hashAtualizado, null);
  });
});

// ---------------------------------------------------------------------------
// GET /conciliacoes/extrato/:id/transacoes — bordas da paginação (HTTP está em
// backend/tests/conciliacao/extrato.test.js; aqui ficam o teto 100 e o offset
// além do fim, que o PostgREST responde com 416).
// ---------------------------------------------------------------------------

describe("GET /conciliacoes/extrato/:id/transacoes", () => {
  function reqBase(overrides = {}) {
    return {
      usuario: { perfil: PERFIS.ADMIN_CLIENTE, cliente_id: CLIENTE_A },
      params: { id: EXTRATO_ID },
      query: {},
      ...overrides,
    };
  }

  it("limit negativo dá 400 ou usa o padrão, nunca range negativo (PRB-C-09, #696)", async () => {
    const res = criarResposta();
    await listarTransacoesExtrato(reqBase({ query: { limit: "-1" } }), res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.erro, /limit/);
  });

  for (const [campo, valor] of [["limit", "abc"], ["limit", "0"], ["offset", "-1"], ["offset", "abc"]]) {
    it(`400 quando ${campo}=${valor} (PRB-C-09, #696)`, async () => {
      const res = criarResposta();
      await listarTransacoesExtrato(reqBase({ query: { [campo]: valor } }), res);

      assert.equal(res.statusCode, 400);
      assert.match(res.body.erro, new RegExp(campo));
    });
  }

  it("limit acima de 100 fica em 100", async () => {
    queue("extratos_bancarios", "maybeSingle", {
      data: { id: EXTRATO_ID, cliente_id: CLIENTE_A },
      error: null,
    });
    queue("transacoes_extrato", "await", { data: [], error: null, count: 0 });

    const res = criarResposta();
    await listarTransacoesExtrato(reqBase({ query: { limit: "150" } }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.limit, 100);
  });

  it("200 com lista vazia quando o offset passa do fim", async () => {
    queue("extratos_bancarios", "maybeSingle", {
      data: { id: EXTRATO_ID, cliente_id: CLIENTE_A },
      error: null,
    });
    queue("transacoes_extrato", "await", {
      data: null,
      error: { message: "Requested range not satisfiable" },
      count: 4,
    });

    const res = criarResposta();
    await listarTransacoesExtrato(reqBase({ query: { offset: "50" } }), res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.data, []);
    assert.equal(res.body.total, 4);
    assert.equal(res.body.offset, 50);
  });
});

