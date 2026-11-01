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
  // A busca de FITIDs já importados termina em .in(): usa fila própria ("await_in"), para não
  // consumir o resultado enfileirado para o insert de transacoes_extrato.
  let consultaIn = false;
  const builder = {
    select() { return builder; },
    insert() { return builder; },
    update() { return builder; },
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
    assert.equal(res.body.mes, 7);
    assert.equal(res.body.ano, 2026);
  });

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
    // o FITID só é único dentro da conta: a busca é por cliente, banco e conta
    assert.deepEqual(
      filtrosEq.filter(([c]) => c.startsWith("extratos_bancarios.") || c === "cliente_id"),
      [
        ["cliente_id", CLIENTE_A],
        ["extratos_bancarios.banco", "0341"],
        ["extratos_bancarios.status", "processado"],
        ["extratos_bancarios.conta", "7890"],
      ],
    );
  });

  it("409 e marca o extrato como erro quando todos os FITIDs do arquivo já foram importados (#692)", async () => {
    queue("extratos_bancarios", "single", { data: { id: EXTRATO_ID, cliente_id: CLIENTE_A }, error: null });
    queue("transacoes_extrato", "await_in", { data: [{ id_banco: "T1" }, { id_banco: "T2" }], error: null });

    let extratoAtualizado = null;
    const insertsTransacoes = [];
    const originalFromLocal = supabase.from;
    supabase.from = function (tabela) {
      const b = originalFromLocal(tabela);
      if (tabela === "extratos_bancarios") {
        const updateOriginal = b.update.bind(b);
        b.update = (campos) => { extratoAtualizado = campos; return updateOriginal(campos); };
      }
      if (tabela === "transacoes_extrato") {
        const insertOriginal = b.insert.bind(b);
        b.insert = (linhas) => { insertsTransacoes.push(linhas); return insertOriginal(linhas); };
      }
      return b;
    };

    const res = criarResposta();
    await criarConciliacaoExtrato(reqUpload(), res);
    supabase.from = originalFromLocal;

    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.body.ignoradas, { ja_importadas: 2, valor_zero: 0 });
    assert.equal(insertsTransacoes.length, 0);
    assert.equal(extratoAtualizado.status, "erro");
    assert.equal(extratoAtualizado.arquivo_hash, null); // libera reenviar o arquivo
  });

  it("422 e não grava transações quando o OFX repete um FITID (#692)", async () => {
    queue("extratos_bancarios", "single", { data: { id: EXTRATO_ID, cliente_id: CLIENTE_A }, error: null });
    const ofx = ofxValido({
      transacoes: [
        { fitid: "DUP1", dtposted: "20260705", trnamt: "-10.00", memo: "A", trntype: "DEBIT" },
        { fitid: "DUP1", dtposted: "20260706", trnamt: "-20.00", memo: "B", trntype: "DEBIT" },
      ],
    });

    const insertsTransacoes = [];
    const originalFromLocal = supabase.from;
    supabase.from = function (tabela) {
      const b = originalFromLocal(tabela);
      if (tabela === "transacoes_extrato") {
        const insertOriginal = b.insert.bind(b);
        b.insert = (linhas) => { insertsTransacoes.push(linhas); return insertOriginal(linhas); };
      }
      return b;
    };

    const res = criarResposta();
    await criarConciliacaoExtrato(reqUpload({ file: { originalname: "dup.ofx", buffer: Buffer.from(ofx) } }), res);
    supabase.from = originalFromLocal;

    assert.equal(res.statusCode, 422);
    assert.match(res.body.detalhe, /FITID repetido no arquivo: "DUP1"/);
    assert.equal(insertsTransacoes.length, 0);
  });

  it("informa quantas linhas de valor 0 foram ignoradas (#692)", async () => {
    queue("extratos_bancarios", "single", { data: { id: EXTRATO_ID, cliente_id: CLIENTE_A }, error: null });
    queue("transacoes_extrato", "await", { data: [], error: null });
    queue("extratos_bancarios", "await", { data: null, error: null });
    const ofx = ofxValido({
      transacoes: [
        { fitid: "Z1", dtposted: "20260705", trnamt: "0.00", memo: "INFORMATIVO", trntype: "CREDIT" },
        { fitid: "T2", dtposted: "20260710", trnamt: "1500.00", memo: "DEPOSITO", trntype: "CREDIT" },
      ],
    });

    const res = criarResposta();
    await criarConciliacaoExtrato(reqUpload({ file: { originalname: "z.ofx", buffer: Buffer.from(ofx) } }), res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.total_transacoes, 1);
    assert.deepEqual(res.body.ignoradas, { ja_importadas: 0, valor_zero: 1 });
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

  it("upload do MESMO arquivo OFX 2x retorna 409 sem duplicar extrato ou transações", async () => {
    const hashesInseridos = [];
    let totalInsertsTransacoes = 0;
    const originalFromLocal = supabase.from;

    supabase.from = function (tabela) {
      const builder = originalFromLocal(tabela);
      const insertOriginal = builder.insert.bind(builder);

      builder.insert = (dados) => {
        if (tabela === "extratos_bancarios") hashesInseridos.push(dados.arquivo_hash);
        if (tabela === "transacoes_extrato") totalInsertsTransacoes += 1;
        return insertOriginal(dados);
      };

      return builder;
    };

    queue("extratos_bancarios", "single", {
      data: { id: EXTRATO_ID, cliente_id: CLIENTE_A },
      error: null,
    });
    queue("transacoes_extrato", "await", { data: [], error: null });
    queue("extratos_bancarios", "await", { data: null, error: null });
    queue("extratos_bancarios", "single", {
      data: null,
      error: {
        code: "23505",
        message:
          'duplicate key value violates unique constraint "uq_extratos_bancarios_cliente_arquivo_hash"',
      },
    });

    try {
      const primeiraResposta = criarResposta();
      await criarConciliacaoExtrato(reqUpload(), primeiraResposta);

      const segundaResposta = criarResposta();
      await criarConciliacaoExtrato(reqUpload(), segundaResposta);

      assert.equal(primeiraResposta.statusCode, 201);
      assert.equal(segundaResposta.statusCode, 409);
      assert.match(segundaResposta.body.erro, /já foi importado/i);
      assert.equal(totalInsertsTransacoes, 1);
      assert.equal(hashesInseridos.length, 2);
      assert.equal(hashesInseridos[0], hashesInseridos[1]);
      assert.match(hashesInseridos[0], /^[0-9a-f]{64}$/);
    } finally {
      supabase.from = originalFromLocal;
    }
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

  it("201 quando mes/ano do body coincidem com o período do arquivo", async () => {
    queue("extratos_bancarios", "single", { data: { id: EXTRATO_ID, cliente_id: CLIENTE_A }, error: null });
    queue("transacoes_extrato", "await", { data: [], error: null });
    queue("extratos_bancarios", "await", { data: null, error: null });

    const res = criarResposta();
    await criarConciliacaoExtrato(reqUpload({ body: { mes: "7", ano: "2026" } }), res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.mes, 7);
    assert.equal(res.body.ano, 2026);
  });

  it("201 no ano 2020 quando o arquivo é desse ano", async () => {
    queue("extratos_bancarios", "single", { data: { id: EXTRATO_ID, cliente_id: CLIENTE_A }, error: null });
    queue("transacoes_extrato", "await", { data: [], error: null });
    queue("extratos_bancarios", "await", { data: null, error: null });

    const res = criarResposta();
    await criarConciliacaoExtrato(
      reqUpload({
        body: { mes: "7", ano: "2020" },
        file: {
          originalname: "extrato.ofx",
          buffer: Buffer.from(
            ofxValido({
              transacoes: [
                { fitid: "T1", dtposted: "20200705", trnamt: "-150.00", memo: "BOLETO", trntype: "DEBIT" },
                { fitid: "T2", dtposted: "20200710", trnamt: "1500.00", memo: "DEPOSITO", trntype: "CREDIT" },
              ],
            }),
          ),
        },
      }),
      res,
    );

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.mes, 7);
    assert.equal(res.body.ano, 2020);
  });

  it("201 no mês da maioria quando o arquivo vaza a virada", async () => {
    queue("extratos_bancarios", "single", { data: { id: EXTRATO_ID, cliente_id: CLIENTE_A }, error: null });
    queue("transacoes_extrato", "await", { data: [], error: null });
    queue("extratos_bancarios", "await", { data: null, error: null });

    const res = criarResposta();
    await criarConciliacaoExtrato(
      reqUpload({
        body: { mes: "8", ano: "2026" },
        file: {
          originalname: "extrato.ofx",
          buffer: Buffer.from(
            ofxValido({
              transacoes: [
                { fitid: "A", dtposted: "20260731", trnamt: "-10.00", memo: "VIRADA", trntype: "DEBIT" },
                { fitid: "B", dtposted: "20260802", trnamt: "-20.00", memo: "AGO1", trntype: "DEBIT" },
                { fitid: "C", dtposted: "20260815", trnamt: "-30.00", memo: "AGO2", trntype: "DEBIT" },
              ],
            }),
          ),
        },
      }),
      res,
    );

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.mes, 8);
    assert.equal(res.body.ano, 2026);
  });

  it("400 por campo quando mes/ano estão fora de faixa, sem gravar extrato", async () => {
    let consultou = false;
    const atual = supabase.from;
    supabase.from = () => {
      consultou = true;
      throw new Error("fora de faixa não deve consultar o banco");
    };

    const casos = [
      { body: { mes: "13", ano: "2024" }, campo: "mes", trecho: /1 e 12/ },
      { body: { mes: "abc", ano: "2024" }, campo: "mes", trecho: /1 e 12/ },
      { body: { mes: "6", ano: "1800" }, campo: "ano", trecho: /2020 e 9999/ },
      { body: { mes: "6", ano: "2019" }, campo: "ano", trecho: /2020 e 9999/ },
      { body: { mes: "13", ano: "1800" }, campo: "mes", trecho: /1 e 12/ },
      { body: { mes: "6" }, campo: "ano", trecho: /obrigatório/ },
      { body: { mes: "0", ano: "2026" }, campo: "mes", trecho: /1 e 12/ },
      { body: { mes: 0, ano: 2026 }, campo: "mes", trecho: /1 e 12/ },
    ];

    try {
      for (const caso of casos) {
        const res = criarResposta();
        await criarConciliacaoExtrato(reqUpload({ body: caso.body }), res);
        assert.equal(res.statusCode, 400, JSON.stringify(caso.body));
        assert.match(res.body.campos[caso.campo], caso.trecho, JSON.stringify(res.body));
        assert.match(res.body.erro, caso.trecho);
      }
      const ambos = criarResposta();
      await criarConciliacaoExtrato(reqUpload({ body: { mes: "13", ano: "1800" } }), ambos);
      assert.match(ambos.body.campos.ano, /2020 e 9999/);
      assert.equal(consultou, false);
    } finally {
      supabase.from = atual;
    }
  });

  it("400 quando o período informado não é o das datas, e o extrato fica em erro sem transações", async () => {
    queue("extratos_bancarios", "single", { data: { id: EXTRATO_ID, cliente_id: CLIENTE_A }, error: null });

    let statusAtualizado = null;
    let hashAtualizado;
    let inseriuTransacoes = false;
    const originalFrom = supabase.from;
    supabase.from = function (tabela) {
      const builder = originalFrom(tabela);
      if (tabela === "transacoes_extrato") {
        const insertOriginal = builder.insert.bind(builder);
        builder.insert = (linhas) => {
          inseriuTransacoes = true;
          return insertOriginal(linhas);
        };
      }
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
    queue("extratos_bancarios", "await", { data: null, error: null });

    const res = criarResposta();
    await criarConciliacaoExtrato(
      reqUpload({
        body: { mes: "4", ano: "2024" },
        file: {
          originalname: "junho.ofx",
          buffer: Buffer.from(
            ofxValido({
              transacoes: [
                { fitid: "J1", dtposted: "20240605", trnamt: "-150.00", memo: "BOLETO", trntype: "DEBIT" },
                { fitid: "J2", dtposted: "20240610", trnamt: "1500.00", memo: "DEPOSITO", trntype: "CREDIT" },
              ],
            }),
          ),
        },
      }),
      res,
    );
    supabase.from = originalFrom;

    assert.equal(res.statusCode, 400);
    assert.match(res.body.erro, /período do arquivo: 6\/2024/);
    assert.equal(res.body.campos.mes, "não corresponde às datas do extrato");
    assert.equal(res.body.campos.ano, "não corresponde às datas do extrato");
    assert.equal(statusAtualizado, "erro");
    assert.equal(hashAtualizado, null);
    assert.equal(inseriuTransacoes, false);
  });

  it("400 nomeia os outros meses quando o arquivo cobre mais de um e março não é a maioria", async () => {
    queue("extratos_bancarios", "single", { data: { id: EXTRATO_ID, cliente_id: CLIENTE_A }, error: null });
    queue("extratos_bancarios", "await", { data: null, error: null });

    const transacoes = [
      ...Array.from({ length: 4 }, (_, i) => ({
        fitid: `J${i}`, dtposted: "20260110", trnamt: "-10.00", memo: "JAN", trntype: "DEBIT",
      })),
      ...Array.from({ length: 3 }, (_, i) => ({
        fitid: `F${i}`, dtposted: "20260210", trnamt: "-10.00", memo: "FEV", trntype: "DEBIT",
      })),
      ...Array.from({ length: 2 }, (_, i) => ({
        fitid: `M${i}`, dtposted: "20260310", trnamt: "-10.00", memo: "MAR", trntype: "DEBIT",
      })),
    ];
    const res = criarResposta();
    await criarConciliacaoExtrato(
      reqUpload({
        body: { mes: "3", ano: "2026" },
        file: { originalname: "trimestre.ofx", buffer: Buffer.from(ofxValido({ transacoes })) },
      }),
      res,
    );

    assert.equal(res.statusCode, 400);
    assert.match(res.body.erro, /1\/2026, o mês com mais transações/);
    assert.match(res.body.erro, /o arquivo cobre mais de um mês: 1\/2026 \(4\), 2\/2026 \(3\), 3\/2026 \(2\)/);
  });

  it("em empate o período é o primeiro mês do arquivo e o outro é recusado dizendo isso", async () => {
    const transacoes = [
      { fitid: "J1", dtposted: "20260105", trnamt: "-10.00", memo: "JAN", trntype: "DEBIT" },
      { fitid: "F1", dtposted: "20260205", trnamt: "-10.00", memo: "FEV", trntype: "DEBIT" },
      { fitid: "J2", dtposted: "20260120", trnamt: "-10.00", memo: "JAN", trntype: "DEBIT" },
      { fitid: "F2", dtposted: "20260220", trnamt: "-10.00", memo: "FEV", trntype: "DEBIT" },
    ];
    const arquivo = {
      originalname: "empate.ofx",
      buffer: Buffer.from(ofxValido({ transacoes })),
    };

    queue("extratos_bancarios", "single", { data: { id: EXTRATO_ID, cliente_id: CLIENTE_A }, error: null });
    queue("transacoes_extrato", "await", { data: [], error: null });
    queue("extratos_bancarios", "await", { data: null, error: null });
    const aceito = criarResposta();
    await criarConciliacaoExtrato(reqUpload({ body: { mes: "1", ano: "2026" }, file: arquivo }), aceito);
    assert.equal(aceito.statusCode, 201);
    assert.equal(aceito.body.mes, 1);

    queue("extratos_bancarios", "single", { data: { id: EXTRATO_ID, cliente_id: CLIENTE_A }, error: null });
    queue("extratos_bancarios", "await", { data: null, error: null });
    const recusado = criarResposta();
    await criarConciliacaoExtrato(reqUpload({ body: { mes: "2", ano: "2026" }, file: arquivo }), recusado);
    assert.equal(recusado.statusCode, 400);
    assert.match(recusado.body.erro, /1\/2026, o primeiro mês do arquivo entre os que empatam/);
    assert.match(recusado.body.erro, /o arquivo cobre mais de um mês: 1\/2026 \(2\), 2\/2026 \(2\)/);
  });

  it("aceita mes com espaço, zero à esquerda e decimal .0 quando o período bate", async () => {
    const arquivo = {
      originalname: "maio.ofx",
      buffer: Buffer.from(
        ofxValido({
          transacoes: [
            { fitid: "M1", dtposted: "20260505", trnamt: "-10.00", memo: "MAIO", trntype: "DEBIT" },
          ],
        }),
      ),
    };

    for (const mes of [" 5", "05", "5.0"]) {
      queue("extratos_bancarios", "single", { data: { id: EXTRATO_ID, cliente_id: CLIENTE_A }, error: null });
      queue("transacoes_extrato", "await", { data: [], error: null });
      queue("extratos_bancarios", "await", { data: null, error: null });

      const res = criarResposta();
      await criarConciliacaoExtrato(reqUpload({ body: { mes, ano: "2026" }, file: arquivo }), res);
      assert.equal(res.statusCode, 201, JSON.stringify(mes));
      assert.equal(res.body.mes, 5);
      assert.equal(res.body.ano, 2026);
    }
  });

  it("500 quando a recusa do período não consegue limpar o hash", async () => {
    queue("extratos_bancarios", "single", { data: { id: EXTRATO_ID, cliente_id: CLIENTE_A }, error: null });
    queue("extratos_bancarios", "await", { data: null, error: { message: "falha ao limpar hash" } });

    const res = criarResposta();
    await criarConciliacaoExtrato(reqUpload({ body: { mes: "4", ano: "2024" } }), res);

    assert.equal(res.statusCode, 500);
    assert.equal(res.body.erro, "Erro ao registrar recusa do período do extrato");
  });

  it("422 e status='erro' quando o OFX está malformado", async () => {
    queue("extratos_bancarios", "single", { data: { id: EXTRATO_ID, cliente_id: CLIENTE_A }, error: null });

    let statusAtualizado = null;
    let hashAtualizado;
    const originalUpdate = supabase.from;
    supabase.from = function (tabela) {
      const builder = originalUpdate(tabela);
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

    const req = reqUpload({ file: { originalname: "extrato.ofx", buffer: Buffer.from("isso não é um OFX") } });
    const res = criarResposta();
    await criarConciliacaoExtrato(req, res);
    supabase.from = originalUpdate;

    assert.equal(res.statusCode, 422);
    assert.ok(res.body.detalhe);
    assert.equal(statusAtualizado, "erro");
    assert.equal(hashAtualizado, null);
  });

  it("422 e não grava transações quando a data do OFX não existe", async () => {
    queue("extratos_bancarios", "single", { data: { id: EXTRATO_ID, cliente_id: CLIENTE_A }, error: null });

    let inseriuTransacoes = false;
    let statusAtualizado = null;
    const originalFromLocal = supabase.from;
    supabase.from = function (tabela) {
      const builder = originalFromLocal(tabela);
      if (tabela === "transacoes_extrato") {
        const insertOriginal = builder.insert.bind(builder);
        builder.insert = (linhas) => {
          inseriuTransacoes = true;
          return insertOriginal(linhas);
        };
      }
      if (tabela === "extratos_bancarios") {
        const updateOriginal = builder.update.bind(builder);
        builder.update = (campos) => {
          if (campos.status) statusAtualizado = campos.status;
          return updateOriginal(campos);
        };
      }
      return builder;
    };
    queue("extratos_bancarios", "await", { data: null, error: null });

    const arquivo = ofxValido({
      transacoes: [
        { fitid: "OK", dtposted: "20240201", trnamt: "10.00", memo: "OK", trntype: "CREDIT" },
        { fitid: "RUIM", dtposted: "20240230", trnamt: "20.00", memo: "RUIM", trntype: "CREDIT" },
      ],
    });
    const res = criarResposta();
    await criarConciliacaoExtrato(
      reqUpload({ file: { originalname: "extrato.ofx", buffer: Buffer.from(arquivo) } }),
      res,
    );
    supabase.from = originalFromLocal;

    assert.equal(res.statusCode, 422);
    assert.equal(res.body.erro, "Arquivo OFX inválido ou malformado");
    assert.match(res.body.detalhe, /20240230/);
    assert.match(res.body.detalhe, /FITID RUIM/);
    assert.match(res.body.detalhe, /transação #2/);
    assert.equal(statusAtualizado, "erro");
    assert.equal(inseriuTransacoes, false);
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

  it("404 (nunca 403) quando o extrato pertence a outro cliente", async () => {
    queue("extratos_bancarios", "maybeSingle", {
      data: { id: EXTRATO_ID, cliente_id: CLIENTE_B },
      error: null,
    });

    const res = criarResposta();
    await listarTransacoesExtrato(reqBase(), res);

    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { erro: "Extrato bancário não encontrado" });
  });
});
