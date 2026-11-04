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
  // A busca de FITIDs já importados (#692) termina em .in(): fila própria
  // ("await_in"), para não consumir o resultado do insert de transacoes_extrato.
  let consultaIn = false;
  const builder = {
    select() { return builder; },
    insert() { return builder; },
    update() { return builder; },
    delete() { return builder; },
    eq() { return builder; },
    is() { return builder; },
    in() { consultaIn = true; return builder; },
    order() { return builder; },
    range() { return builder; },
    maybeSingle() { return Promise.resolve(consumir("maybeSingle", { data: null, error: null })); },
    single() { return Promise.resolve(consumir("single", { data: null, error: null })); },
    then(resolve, reject) {
      return Promise.resolve(consumir(consultaIn ? "await_in" : "await", { data: [], error: null })).then(resolve, reject);
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

function ofxValido({ transacoes, bankid = "0341", acctid = "1234567890" } = {}) {
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
<BANKID>${bankid}
<ACCTID>${acctid}
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
  it("só importa as transações cujo FITID ainda não existe (extratos sobrepostos) e informa as ignoradas (#692)", async () => {
    queue("extratos_bancarios", "single", { data: { id: EXTRATO_ID, cliente_id: CLIENTE_A }, error: null });
    queue("transacoes_extrato", "await_in", { data: [{ id_banco: "T1" }], error: null }); // T1 já existe
    queue("transacoes_extrato", "await", { data: [], error: null }); // insert
    queue("extratos_bancarios", "await", { data: null, error: null }); // update final

    let inseridas = null;
    const filtrosEq = [];
    const originalFromLocal = supabase.from;
    supabase.from = function (tabela) {
      const b = originalFromLocal(tabela);
      if (tabela === "transacoes_extrato") {
        const insertOriginal = b.insert.bind(b);
        b.insert = (linhas) => { inseridas = linhas; return insertOriginal(linhas); };
        const eqOriginal = b.eq.bind(b);
        b.eq = (coluna, valor) => { filtrosEq.push([coluna, valor]); return eqOriginal(coluna, valor); };
      }
      return b;
    };

    const res = criarResposta();
    await criarConciliacaoExtrato(reqUpload(), res);
    supabase.from = originalFromLocal;

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.total_transacoes, 1);
    assert.deepEqual(res.body.ignoradas, { ja_importadas: 1, valor_zero: 0 });
    assert.deepEqual(inseridas.map((t) => t.id_banco), ["T2"]);
    // o FITID só é único dentro da conta: a busca é por cliente e pela identidade normalizada
    // de banco (0341 -> 341) e conta (ACCTID inteiro), não pela máscara de 4 dígitos
    assert.deepEqual(
      filtrosEq.filter(([c]) => ["cliente_id", "banco_chave", "conta_chave"].includes(c)),
      [
        ["cliente_id", CLIENTE_A],
        ["banco_chave", "341"],
        ["conta_chave", "1234567890"],
      ],
    );
    assert.ok(inseridas.every((t) => t.banco_chave === "341" && t.conta_chave === "1234567890"));
  });

  it("500 quando falha a busca de FITIDs já importados (#692)", async () => {
    queue("extratos_bancarios", "single", { data: { id: EXTRATO_ID, cliente_id: CLIENTE_A }, error: null });
    queue("transacoes_extrato", "await_in", { data: null, error: { message: "falha" } });

    const res = criarResposta();
    await criarConciliacaoExtrato(reqUpload(), res);

    assert.equal(res.statusCode, 500);
  });

  it("consulta os FITIDs já importados em lotes de até 100 (#692)", async () => {
    queue("extratos_bancarios", "single", { data: { id: EXTRATO_ID, cliente_id: CLIENTE_A }, error: null });
    queue("transacoes_extrato", "await", { data: [], error: null });
    queue("extratos_bancarios", "await", { data: null, error: null });
    const ofx = ofxValido({
      transacoes: Array.from({ length: 250 }, (_, i) => ({
        fitid: `F${i}`, dtposted: "20260705", trnamt: "10.00", memo: "M", trntype: "CREDIT",
      })),
    });

    const lotes = [];
    const originalFromLocal = supabase.from;
    supabase.from = function (tabela) {
      const b = originalFromLocal(tabela);
      if (tabela === "transacoes_extrato") {
        const inOriginal = b.in.bind(b);
        b.in = (coluna, valores) => { lotes.push(valores.length); return inOriginal(coluna, valores); };
      }
      return b;
    };

    const res = criarResposta();
    await criarConciliacaoExtrato(reqUpload({ file: { originalname: "g.ofx", buffer: Buffer.from(ofx) } }), res);
    supabase.from = originalFromLocal;

    assert.equal(res.statusCode, 201);
    assert.deepEqual(lotes, [100, 100, 50]);
  });

  // Espia os filtros .eq e o insert de transacoes_extrato de um upload.
  async function subirEspiando(ofx) {
    const filtros = [];
    let inseridas = null;
    const originalFromLocal = supabase.from;
    supabase.from = function (tabela) {
      const b = originalFromLocal(tabela);
      if (tabela === "transacoes_extrato") {
        const eqOriginal = b.eq.bind(b);
        b.eq = (coluna, valor) => { filtros.push([coluna, valor]); return eqOriginal(coluna, valor); };
        const insertOriginal = b.insert.bind(b);
        b.insert = (linhas) => { inseridas = linhas; return insertOriginal(linhas); };
      }
      return b;
    };
    const res = criarResposta();
    await criarConciliacaoExtrato(reqUpload({ file: { originalname: "x.ofx", buffer: Buffer.from(ofx) } }), res);
    supabase.from = originalFromLocal;
    return { res, filtros, inseridas };
  }

  function enfileirarUploadSemDuplicatas() {
    queue("extratos_bancarios", "single", { data: { id: EXTRATO_ID, cliente_id: CLIENTE_A }, error: null });
    queue("transacoes_extrato", "await", { data: [], error: null });
    queue("extratos_bancarios", "await", { data: null, error: null });
  }

  it("contas diferentes com os mesmos 4 últimos dígitos são buscadas por identidades diferentes (#692)", async () => {
    const chaveConta = async (acctid) => {
      enfileirarUploadSemDuplicatas();
      const { res, filtros } = await subirEspiando(ofxValido({ acctid }));
      assert.equal(res.statusCode, 201);
      assert.equal(res.body.conta, "7890"); // a máscara exibida é a mesma nas duas
      return filtros.find(([c]) => c === "conta_chave")[1];
    };
    const a = await chaveConta("11117890");
    const b = await chaveConta("22227890");
    assert.notEqual(a, b);
  });

  it("BANKID 0237 e 237, e ACCTID com separador e zeros, viram a mesma identidade (#692)", async () => {
    const chaves = async (bankid, acctid) => {
      enfileirarUploadSemDuplicatas();
      const { res, inseridas } = await subirEspiando(ofxValido({ bankid, acctid }));
      assert.equal(res.statusCode, 201);
      return [inseridas[0].banco_chave, inseridas[0].conta_chave];
    };
    assert.deepEqual(await chaves("0237", "0012345-6"), ["237", "123456"]);
    assert.deepEqual(await chaves("237", "123456"), ["237", "123456"]);
  });

  it("TRNAMT que arredonda para 0.00 é ignorado como valor zero, e o valor gravado é o arredondado (#692)", async () => {
    enfileirarUploadSemDuplicatas();
    const ofx = ofxValido({
      transacoes: [
        { fitid: "Z1", dtposted: "20260705", trnamt: "0.004", memo: "MICRO", trntype: "CREDIT" },
        { fitid: "T2", dtposted: "20260710", trnamt: "10.126", memo: "DEPOSITO", trntype: "CREDIT" },
      ],
    });
    const { res, inseridas } = await subirEspiando(ofx);

    assert.equal(res.statusCode, 201);
    assert.deepEqual(res.body.ignoradas, { ja_importadas: 0, valor_zero: 1 });
    assert.deepEqual(inseridas.map((t) => [t.id_banco, t.valor]), [["T2", 10.13]]);
  });

  it("409 e extrato em erro quando outro upload grava o mesmo FITID no meio (violação do índice único) (#692)", async () => {
    queue("extratos_bancarios", "single", { data: { id: EXTRATO_ID, cliente_id: CLIENTE_A }, error: null });
    queue("transacoes_extrato", "await", { data: null, error: { code: "23505", message: "duplicate key" } });

    let extratoAtualizado = null;
    const originalFromLocal = supabase.from;
    supabase.from = function (tabela) {
      const b = originalFromLocal(tabela);
      if (tabela === "extratos_bancarios") {
        const updateOriginal = b.update.bind(b);
        b.update = (campos) => { extratoAtualizado = campos; return updateOriginal(campos); };
      }
      return b;
    };
    const res = criarResposta();
    await criarConciliacaoExtrato(reqUpload(), res);
    supabase.from = originalFromLocal;

    assert.equal(res.statusCode, 409);
    assert.equal(extratoAtualizado.status, "erro");
    assert.equal(extratoAtualizado.arquivo_hash, null);
  });

  it("apaga as transações do extrato quando falha o update final, para liberar o reenvio (#692)", async () => {
    queue("extratos_bancarios", "single", { data: { id: EXTRATO_ID, cliente_id: CLIENTE_A }, error: null });
    queue("transacoes_extrato", "await", { data: [], error: null });
    queue("extratos_bancarios", "await", { data: null, error: { message: "timeout" } });

    const apagadas = [];
    const originalFromLocal = supabase.from;
    supabase.from = function (tabela) {
      const b = originalFromLocal(tabela);
      if (tabela === "transacoes_extrato") {
        const deleteOriginal = b.delete.bind(b);
        b.delete = () => { apagadas.push(tabela); return deleteOriginal(); };
      }
      return b;
    };
    const res = criarResposta();
    await criarConciliacaoExtrato(reqUpload(), res);
    supabase.from = originalFromLocal;

    assert.equal(res.statusCode, 500);
    assert.deepEqual(apagadas, ["transacoes_extrato"]);
  });


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
    queue("transacoes_extrato", "await_in", { data: [], error: null }); // FITIDs já importados: nenhum
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

  it("500 e status='erro' quando falha o update final", async () => {
    queue("extratos_bancarios", "single", { data: { id: EXTRATO_ID, cliente_id: CLIENTE_A }, error: null });
    queue("transacoes_extrato", "await_in", { data: [], error: null }); // FITIDs já importados: nenhum
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

  // BUG (#696): limit=-1 passa direto (parseInt("-1") || 20 = -1) e vira
  // .range(0, -2), que o PostgREST recusa com 500. Esperado: 400 ou o padrão.
  it.skip("limit negativo dá 400 ou usa o padrão, nunca range negativo (PRB-C-09, #696)", async () => {
    queue("extratos_bancarios", "maybeSingle", {
      data: { id: EXTRATO_ID, cliente_id: CLIENTE_A },
      error: null,
    });
    queue("transacoes_extrato", "await", { data: [], error: null, count: 0 });

    const res = criarResposta();
    await listarTransacoesExtrato(reqBase({ query: { limit: "-1" } }), res);

    if (res.statusCode !== 400) {
      assert.equal(res.statusCode, 200);
      assert.ok(res.body.limit >= 1, `limit devolvido: ${res.body.limit}`);
    }
  });
});

