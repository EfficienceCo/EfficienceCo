import { describe, it, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import supabase from "../src/config/database.js";
import { PERFIS } from "../src/config/perfis.js";
import {
  criarLancamentoContabil,
  listarLancamentosContabeis,
  atualizarLancamentoContabil,
  deletarLancamentoContabil,
} from "../src/controllers/lancamentos-contabeis.controller.js";
import { CATEGORIA_MAXIMO, DESCRICAO_MAXIMO } from "../src/utils/texto-conciliacao.util.js";

const CLIENTE_A = "11111111-1111-1111-1111-111111111111";
const CLIENTE_B = "22222222-2222-2222-2222-222222222222";
const LANCAMENTO_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USUARIO_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const OUTRO_USUARIO_ID = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";

// ---------------------------------------------------------------------------
// Mock de supabase
// ---------------------------------------------------------------------------

const originalFrom = supabase.from;
const filas = new Map();
let ultimoPayload = null;
function chave(t, m) { return `${t}:${m}`; }
function enqueue(tabela, metodo, resultado) {
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
    insert(payload) { ultimoPayload = payload; return builder; },
    update(payload) { ultimoPayload = payload; return builder; },
    delete() { return builder; },
    eq() { return builder; },
    gte() { return builder; },
    lte() { return builder; },
    order() { return builder; },
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

beforeEach(() => {
  filas.clear();
  ultimoPayload = null;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function criarResposta() {
  return {
    statusCode: null,
    body: null,
    status(codigo) { this.statusCode = codigo; return this; },
    json(payload) { this.body = payload; return this; },
    send(payload) { this.body = payload; return this; },
  };
}

function reqAdmin(body, overrides = {}) {
  return {
    body: body ?? {},
    params: {},
    query: {},
    usuario: { perfil: PERFIS.ADMIN_CLIENTE, cliente_id: CLIENTE_A },
    ...overrides,
  };
}

function payloadValido(overrides = {}) {
  return {
    cliente_id: CLIENTE_A,
    data_lancamento: "2026-08-05",
    valor: 1500.0,
    tipo: "debito",
    descricao: "Pagamento fornecedor ABC",
    categoria: "fornecedor",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// POST /lancamentos-contabeis
// ---------------------------------------------------------------------------

describe("POST /lancamentos-contabeis", () => {

  // Validação de entrada (#558): só a UI validava; a API aceitava lixo ou
  // devolvia 500 genérico.

  it("grava criado_por do token, categoria validada, e ignora criado_por do corpo (PRB-C-24, #695)", async () => {
    enqueue("lancamentos_contabeis", "single", { data: { id: "novo-id" }, error: null });

    const res = criarResposta();
    await criarLancamentoContabil(
      reqAdmin(payloadValido({ criado_por: OUTRO_USUARIO_ID, categoria: "  fornecedor  " }), {
        usuario: { id: USUARIO_ID, perfil: PERFIS.ADMIN_CLIENTE, cliente_id: CLIENTE_A },
      }),
      res,
    );

    assert.equal(res.statusCode, 201);
    assert.equal(ultimoPayload.criado_por, USUARIO_ID);
    assert.equal(ultimoPayload.categoria, "fornecedor");
  });

  it("500 quando o Supabase retorna erro no insert", async () => {
    enqueue("lancamentos_contabeis", "single", { data: null, error: { message: "falha" } });

    const res = criarResposta();
    await criarLancamentoContabil(reqAdmin(payloadValido()), res);

    assert.equal(res.statusCode, 500);
  });
});

// ---------------------------------------------------------------------------
// GET /lancamentos-contabeis
// ---------------------------------------------------------------------------

describe("GET /lancamentos-contabeis", () => {

  it("500 quando o Supabase retorna erro", async () => {
    enqueue("lancamentos_contabeis", "await", { data: null, error: { message: "falha" } });

    const res = criarResposta();
    await listarLancamentosContabeis(reqAdmin(undefined, { query: {} }), res);

    assert.equal(res.statusCode, 500);
  });
});


// ---------------------------------------------------------------------------
// DELETE /lancamentos-contabeis/:id
// ---------------------------------------------------------------------------

describe("DELETE /lancamentos-contabeis/:id", () => {

  it("500 quando delete falha por outro motivo (não FK)", async () => {
    enqueue("lancamentos_contabeis", "single", {
      data: { id: LANCAMENTO_ID, cliente_id: CLIENTE_A, conciliado: false },
      error: null,
    });
    enqueue("lancamentos_contabeis", "await", {
      data: null,
      error: { code: "08000", message: "connection error" },
    });

    const res = criarResposta();
    await deletarLancamentoContabil(reqAdmin(undefined, { params: { id: LANCAMENTO_ID } }), res);

    assert.equal(res.statusCode, 500);
  });
});

// ---------------------------------------------------------------------------
// PRB-C-07 / BUG-CONC-20 (#697). Mesmos títulos do skip da TEST-7.
// ---------------------------------------------------------------------------

describe("Lançamentos contábeis — descrição e categoria com teto", () => {
  const TEXTO_LONGO = "x".repeat(10_000);

  for (const [nome, overrides, campo] of [
    ["descrição com 10.000 caracteres", { descricao: TEXTO_LONGO }, "descricao"],
    ["categoria com 10.000 caracteres", { categoria: TEXTO_LONGO }, "categoria"],
    ["categoria não-texto", { categoria: 123 }, "categoria"],
  ]) {
    it(`POST: 400 com mensagem do campo quando ${nome} (PRB-C-07, #697)`, async () => {
      enqueue("lancamentos_contabeis", "single", { data: { id: "novo-id" }, error: null });
      const res = criarResposta();
      await criarLancamentoContabil(reqAdmin(payloadValido(overrides)), res);

      assert.equal(res.statusCode, 400);
      assert.ok(res.body.campos?.[campo], `esperava mensagem para ${campo}`);
      assert.ok(res.body.erro.includes(res.body.campos[campo]));
      assert.equal(ultimoPayload, null, "não deveria chegar ao insert");
    });
  }

  it("PATCH: 400 quando a categoria tem 10.000 caracteres (PRB-C-07, #697)", async () => {
    enqueue("lancamentos_contabeis", "single", { data: { id: LANCAMENTO_ID, cliente_id: CLIENTE_A }, error: null });
    const res = criarResposta();
    await atualizarLancamentoContabil(
      reqAdmin({ categoria: TEXTO_LONGO }, { params: { id: LANCAMENTO_ID } }),
      res,
    );

    assert.equal(res.statusCode, 400);
    assert.ok(res.body.campos?.categoria);
    assert.equal(ultimoPayload, null, "não deveria chegar ao update");
  });

  it("PATCH: 400 quando a descrição tem 10.000 caracteres e quando a categoria não é texto", async () => {
    for (const body of [{ descricao: TEXTO_LONGO }, { categoria: { nome: "x" } }]) {
      ultimoPayload = null;
      enqueue("lancamentos_contabeis", "single", { data: { id: LANCAMENTO_ID, cliente_id: CLIENTE_A }, error: null });
      const res = criarResposta();
      await atualizarLancamentoContabil(reqAdmin(body, { params: { id: LANCAMENTO_ID } }), res);

      assert.equal(res.statusCode, 400);
      assert.equal(ultimoPayload, null);
    }
  });

  it("aceita descrição e categoria no teto e grava sem espaços nas pontas", async () => {
    enqueue("lancamentos_contabeis", "single", { data: { id: "novo-id" }, error: null });
    const res = criarResposta();
    await criarLancamentoContabil(
      reqAdmin(payloadValido({
        descricao: `  ${"a".repeat(DESCRICAO_MAXIMO)}  `,
        categoria: `  ${"b".repeat(CATEGORIA_MAXIMO)}  `,
      })),
      res,
    );

    assert.equal(res.statusCode, 201);
    assert.equal(ultimoPayload.descricao, "a".repeat(DESCRICAO_MAXIMO));
    assert.equal(ultimoPayload.categoria, "b".repeat(CATEGORIA_MAXIMO));
  });

  it("400 quando descrição ou categoria passam uma unidade do teto", async () => {
    for (const [overrides, campo] of [
      [{ descricao: "a".repeat(DESCRICAO_MAXIMO + 1) }, "descricao"],
      [{ categoria: "b".repeat(CATEGORIA_MAXIMO + 1) }, "categoria"],
    ]) {
      ultimoPayload = null;
      const res = criarResposta();
      await criarLancamentoContabil(reqAdmin(payloadValido(overrides)), res);

      assert.equal(res.statusCode, 400);
      assert.match(res.body.campos[campo], /máximo/);
      assert.equal(ultimoPayload, null);
    }
  });

  it("grava categoria vazia ou null como null", async () => {
    for (const categoria of ["   ", null]) {
      ultimoPayload = null;
      enqueue("lancamentos_contabeis", "single", { data: { id: "novo-id" }, error: null });
      const res = criarResposta();
      await criarLancamentoContabil(reqAdmin(payloadValido({ categoria })), res);

      assert.equal(res.statusCode, 201);
      assert.equal(ultimoPayload.categoria, null);
    }
  });

  it("PATCH grava a categoria no teto e limpa categoria vazia", async () => {
    enqueue("lancamentos_contabeis", "single", { data: { id: LANCAMENTO_ID, cliente_id: CLIENTE_A }, error: null });
    enqueue("lancamentos_contabeis", "single", { data: { id: LANCAMENTO_ID }, error: null });
    const res = criarResposta();
    await atualizarLancamentoContabil(
      reqAdmin({ categoria: `  ${"c".repeat(CATEGORIA_MAXIMO)}  ` }, { params: { id: LANCAMENTO_ID } }),
      res,
    );

    assert.equal(res.statusCode, 200);
    assert.deepEqual(ultimoPayload, { categoria: "c".repeat(CATEGORIA_MAXIMO) });

    ultimoPayload = null;
    enqueue("lancamentos_contabeis", "single", { data: { id: LANCAMENTO_ID, cliente_id: CLIENTE_A }, error: null });
    enqueue("lancamentos_contabeis", "single", { data: { id: LANCAMENTO_ID }, error: null });
    const limpa = criarResposta();
    await atualizarLancamentoContabil(
      reqAdmin({ categoria: "" }, { params: { id: LANCAMENTO_ID } }),
      limpa,
    );

    assert.equal(limpa.statusCode, 200);
    assert.deepEqual(ultimoPayload, { categoria: null });
  });
});
