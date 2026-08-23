import { describe, it, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import supabase from "../src/config/database.js";
import { PERFIS } from "../src/config/perfis.js";
import {
  criarConciliacaoExtrato,
  listarTransacoesExtrato,
} from "../src/controllers/conciliacoes.controller.js";

const CLIENTE_A = "11111111-1111-1111-1111-111111111111";
const CLIENTE_B = "22222222-2222-2222-2222-222222222222";
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
  it("201 e persiste extrato + transações quando OFX válido", async () => {
    queue("extratos_bancarios", "single", {
      data: { id: EXTRATO_ID, cliente_id: CLIENTE_A },
      error: null,
    });
    queue("transacoes_extrato", "await", { data: [], error: null });
    queue("extratos_bancarios", "await", { data: null, error: null }); // update final

    const res = criarResposta();
    await criarConciliacaoExtrato(reqUpload(), res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.extrato_id, EXTRATO_ID);
    assert.equal(res.body.total_transacoes, 2);
    assert.equal(res.body.banco, "0341");
    assert.equal(res.body.conta, "7890");
  });

  it("infere crédito/débito corretamente do sinal do TRNAMT", async () => {
    queue("extratos_bancarios", "single", { data: { id: EXTRATO_ID, cliente_id: CLIENTE_A }, error: null });

    let transacoesInseridas = null;
    const originalInsert = supabase.from;
    supabase.from = function (tabela) {
      const builder = originalInsert(tabela);
      if (tabela === "transacoes_extrato") {
        const insertOriginal = builder.insert.bind(builder);
        builder.insert = (linhas) => {
          transacoesInseridas = linhas;
          return insertOriginal(linhas);
        };
      }
      return builder;
    };

    queue("transacoes_extrato", "await", { data: [], error: null });
    queue("extratos_bancarios", "await", { data: null, error: null });

    const res = criarResposta();
    await criarConciliacaoExtrato(reqUpload(), res);
    supabase.from = originalInsert;

    assert.equal(res.statusCode, 201);
    assert.equal(transacoesInseridas[0].tipo, "debito");
    assert.equal(transacoesInseridas[0].valor, 150);
    assert.equal(transacoesInseridas[1].tipo, "credito");
    assert.equal(transacoesInseridas[1].valor, 1500);
  });

  it("usa mes/ano do body quando informado, sem inferir das transações", async () => {
    queue("extratos_bancarios", "single", { data: { id: EXTRATO_ID, cliente_id: CLIENTE_A }, error: null });
    queue("transacoes_extrato", "await", { data: [], error: null });
    queue("extratos_bancarios", "await", { data: null, error: null });

    const res = criarResposta();
    await criarConciliacaoExtrato(reqUpload({ body: { mes: "1", ano: "2026" } }), res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.mes, 1);
    assert.equal(res.body.ano, 2026);
  });

  it("422 e status='erro' quando o OFX está malformado", async () => {
    queue("extratos_bancarios", "single", { data: { id: EXTRATO_ID, cliente_id: CLIENTE_A }, error: null });

    let statusAtualizado = null;
    const originalUpdate = supabase.from;
    supabase.from = function (tabela) {
      const builder = originalUpdate(tabela);
      if (tabela === "extratos_bancarios") {
        const updateOriginal = builder.update.bind(builder);
        builder.update = (campos) => {
          if (campos.status) statusAtualizado = campos.status;
          return updateOriginal(campos);
        };
      }
      return builder;
    };
    queue("extratos_bancarios", "await", { data: null, error: null }); // update de erro

    const req = reqUpload({ file: { originalname: "extrato.ofx", buffer: Buffer.from("isso não é um OFX") } });
    const res = criarResposta();
    await criarConciliacaoExtrato(req, res);
    supabase.from = originalUpdate;

    assert.equal(res.statusCode, 422);
    assert.ok(res.body.detalhe);
    assert.equal(statusAtualizado, "erro");
  });

  it("400 quando nenhum arquivo é enviado", async () => {
    const res = criarResposta();
    await criarConciliacaoExtrato(reqUpload({ file: undefined }), res);

    assert.equal(res.statusCode, 400);
  });

  it("400 quando cliente_id não pode ser resolvido (admin_efficience sem informar)", async () => {
    const res = criarResposta();
    await criarConciliacaoExtrato(
      reqUpload({ usuario: { perfil: PERFIS.ADMIN_EFFICIENCE }, body: {} }),
      res,
    );

    assert.equal(res.statusCode, 400);
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
    const originalFromLocal = supabase.from;
    supabase.from = function (tabela) {
      const builder = originalFromLocal(tabela);
      if (tabela === "extratos_bancarios") {
        const updateOriginal = builder.update.bind(builder);
        builder.update = (campos) => {
          if (campos.status) statusAtualizado = campos.status;
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
  });

  it("500 e status='erro' quando falha o update final (transações já salvas ficam órfãs sem isso)", async () => {
    queue("extratos_bancarios", "single", { data: { id: EXTRATO_ID, cliente_id: CLIENTE_A }, error: null });
    queue("transacoes_extrato", "await", { data: [], error: null });

    let statusAtualizado = null;
    const originalFromLocal = supabase.from;
    supabase.from = function (tabela) {
      const builder = originalFromLocal(tabela);
      if (tabela === "extratos_bancarios") {
        const updateOriginal = builder.update.bind(builder);
        builder.update = (campos) => {
          if (campos.status) statusAtualizado = campos.status;
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
  });

  it("decodifica MEMO acentuado corretamente (extrato real vem em Windows-1252, não UTF-8)", async () => {
    queue("extratos_bancarios", "single", { data: { id: EXTRATO_ID, cliente_id: CLIENTE_A }, error: null });

    let transacoesInseridas = null;
    const originalFromLocal = supabase.from;
    supabase.from = function (tabela) {
      const builder = originalFromLocal(tabela);
      if (tabela === "transacoes_extrato") {
        const insertOriginal = builder.insert.bind(builder);
        builder.insert = (linhas) => {
          transacoesInseridas = linhas;
          return insertOriginal(linhas);
        };
      }
      return builder;
    };
    queue("transacoes_extrato", "await", { data: [], error: null });
    queue("extratos_bancarios", "await", { data: null, error: null });

    const conteudoComAcento = ofxValido({
      transacoes: [
        { fitid: "T1", dtposted: "20260705", trnamt: "-50.00", memo: "PAGAMENTO À VISTA - CONDOMÍNIO", trntype: "DEBIT" },
      ],
    }).replace("OFXHEADER:100", "OFXHEADER:100\nCHARSET:1252");

    const req = reqUpload({
      file: { originalname: "extrato.ofx", buffer: Buffer.from(conteudoComAcento, "latin1") },
    });
    const res = criarResposta();
    await criarConciliacaoExtrato(req, res);
    supabase.from = originalFromLocal;

    assert.equal(res.statusCode, 201);
    assert.equal(transacoesInseridas[0].descricao, "PAGAMENTO À VISTA - CONDOMÍNIO");
  });
});

// ---------------------------------------------------------------------------
// GET /conciliacoes/extrato/:id/transacoes
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

  it("200 com transações paginadas do extrato", async () => {
    queue("extratos_bancarios", "maybeSingle", {
      data: { id: EXTRATO_ID, cliente_id: CLIENTE_A },
      error: null,
    });
    queue("transacoes_extrato", "await", {
      data: [{ id: "t1" }, { id: "t2" }],
      error: null,
      count: 2,
    });

    const res = criarResposta();
    await listarTransacoesExtrato(reqBase({ query: { limit: "10", offset: "0" } }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.length, 2);
    assert.equal(res.body.total, 2);
    assert.equal(res.body.limit, 10);
  });

  it("404 quando extrato não existe", async () => {
    queue("extratos_bancarios", "maybeSingle", { data: null, error: null });

    const res = criarResposta();
    await listarTransacoesExtrato(reqBase(), res);

    assert.equal(res.statusCode, 404);
  });

  it("403 quando o extrato pertence a outro cliente", async () => {
    queue("extratos_bancarios", "maybeSingle", {
      data: { id: EXTRATO_ID, cliente_id: CLIENTE_B },
      error: null,
    });

    const res = criarResposta();
    await listarTransacoesExtrato(reqBase(), res);

    assert.equal(res.statusCode, 403);
  });
});
