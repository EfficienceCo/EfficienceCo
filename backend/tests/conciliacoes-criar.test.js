import { describe, it, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import supabase from "../src/config/database.js";
import { PERFIS } from "../src/config/perfis.js";
import { criarConciliacao } from "../src/controllers/conciliacoes.controller.js";

const CLIENTE_A = "11111111-1111-1111-1111-111111111111";
const CLIENTE_B = "22222222-2222-2222-2222-222222222222";
const EXTRATO_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CONCILIACAO_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

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
    delete() { return builder; },
    eq() { return builder; },
    gte() { return builder; },
    lte() { return builder; },
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

function reqBase(overrides = {}) {
  return {
    usuario: { perfil: PERFIS.ADMIN_CLIENTE, cliente_id: CLIENTE_A },
    body: { extrato_id: EXTRATO_ID, mes: 7, ano: 2026 },
    query: {},
    ...overrides,
  };
}

function queueExtratoValido(overrides = {}) {
  queue("extratos_bancarios", "maybeSingle", {
    data: { id: EXTRATO_ID, cliente_id: CLIENTE_A, status: "processado", mes: 7, ano: 2026, ...overrides },
    error: null,
  });
}

// ---------------------------------------------------------------------------
// POST /conciliacoes
// ---------------------------------------------------------------------------

describe("POST /conciliacoes", () => {
  it("201: roda o matching e persiste conciliacao + pares", async () => {
    queueExtratoValido();
    queue("transacoes_extrato", "await", {
      data: [
        { id: "t1", tipo: "credito", valor: 100, data_lancamento: "2026-07-01" },
        { id: "t2", tipo: "debito", valor: 50, data_lancamento: "2026-07-10" },
        { id: "t3", tipo: "credito", valor: 999, data_lancamento: "2026-07-15" },
      ],
      error: null,
    });
    queue("lancamentos_contabeis", "await", {
      data: [
        { id: "l1", tipo: "credito", valor: 100, data_lancamento: "2026-07-01" }, // automatico com t1
        { id: "l2", tipo: "debito", valor: 50, data_lancamento: "2026-07-12" }, // provavel com t2 (2 dias)
      ],
      error: null,
    });

    let paresInseridos = null;
    let conciliacaoInserida = null;
    const originalFromLocal = supabase.from;
    supabase.from = function (tabela) {
      const b = originalFromLocal(tabela);
      if (tabela === "pares_conciliacao") {
        const insertOriginal = b.insert.bind(b);
        b.insert = (linhas) => { paresInseridos = linhas; return insertOriginal(linhas); };
      }
      if (tabela === "conciliacoes") {
        const insertOriginal = b.insert.bind(b);
        b.insert = (campos) => { conciliacaoInserida = campos; return insertOriginal(campos); };
      }
      return b;
    };

    queue("conciliacoes", "single", {
      data: { id: CONCILIACAO_ID, cliente_id: CLIENTE_A, extrato_id: EXTRATO_ID },
      error: null,
    });
    queue("pares_conciliacao", "await", { data: [], error: null });

    const res = criarResposta();
    await criarConciliacao(reqBase(), res);
    supabase.from = originalFromLocal;

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.conciliacao_id, CONCILIACAO_ID);
    assert.equal(res.body.total_transacoes, 3);
    assert.equal(res.body.automaticos, 1);
    assert.equal(res.body.provaveis, 1);
    assert.equal(res.body.sem_par, 1);

    assert.equal(conciliacaoInserida.total_transacoes, 3);
    assert.equal(conciliacaoInserida.total_conciliadas, 1);
    assert.equal(conciliacaoInserida.total_pendentes, 2);
    assert.equal(conciliacaoInserida.status, "em_andamento");

    assert.equal(paresInseridos.length, 3);
    assert.ok(paresInseridos.every((p) => p.conciliacao_id === CONCILIACAO_ID));
    assert.ok(paresInseridos.some((p) => p.transacao_id === "t1" && p.lancamento_id === "l1" && p.confianca === "automatico"));
    assert.ok(paresInseridos.some((p) => p.transacao_id === "t2" && p.lancamento_id === "l2" && p.confianca === "provavel"));
    assert.ok(paresInseridos.some((p) => p.transacao_id === "t3" && p.lancamento_id === null && p.confianca === "sem_par"));
  });

  it("400 quando extrato_id não é informado", async () => {
    const res = criarResposta();
    await criarConciliacao(reqBase({ body: { mes: 7, ano: 2026 } }), res);
    assert.equal(res.statusCode, 400);
  });

  it("400 quando mes/ano ausentes ou inválidos", async () => {
    const res = criarResposta();
    await criarConciliacao(reqBase({ body: { extrato_id: EXTRATO_ID, mes: 13, ano: 2026 } }), res);
    assert.equal(res.statusCode, 400);
  });

  it("400 quando cliente_id não pode ser resolvido (admin_efficience sem informar)", async () => {
    const res = criarResposta();
    await criarConciliacao(
      reqBase({ usuario: { perfil: PERFIS.ADMIN_EFFICIENCE }, body: { extrato_id: EXTRATO_ID, mes: 7, ano: 2026 } }),
      res,
    );
    assert.equal(res.statusCode, 400);
  });

  it("404 quando o extrato não existe", async () => {
    queue("extratos_bancarios", "maybeSingle", { data: null, error: null });
    const res = criarResposta();
    await criarConciliacao(reqBase(), res);
    assert.equal(res.statusCode, 404);
  });

  it("403 quando o extrato pertence a outro cliente", async () => {
    queueExtratoValido({ cliente_id: CLIENTE_B });
    const res = criarResposta();
    await criarConciliacao(reqBase(), res);
    assert.equal(res.statusCode, 403);
  });

  it("409 quando o extrato ainda não foi processado com sucesso", async () => {
    queueExtratoValido({ status: "erro" });
    const res = criarResposta();
    await criarConciliacao(reqBase(), res);
    assert.equal(res.statusCode, 409);
  });

  it("400 quando mes/ano do body não correspondem ao período do extrato", async () => {
    queueExtratoValido({ mes: 8, ano: 2026 });
    const res = criarResposta();
    await criarConciliacao(reqBase({ body: { extrato_id: EXTRATO_ID, mes: 7, ano: 2026 } }), res);
    assert.equal(res.statusCode, 400);
  });

  it("409 quando já existe uma conciliação em andamento para o extrato", async () => {
    queueExtratoValido();
    queue("conciliacoes", "maybeSingle", { data: { id: "conciliacao-existente" }, error: null });
    const res = criarResposta();
    await criarConciliacao(reqBase(), res);
    assert.equal(res.statusCode, 409);
  });

  it("500 quando falha a busca de transações do extrato", async () => {
    queueExtratoValido();
    queue("transacoes_extrato", "await", { data: null, error: { message: "falha" } });
    const res = criarResposta();
    await criarConciliacao(reqBase(), res);
    assert.equal(res.statusCode, 500);
  });

  it("500 quando falha a busca de lançamentos contábeis", async () => {
    queueExtratoValido();
    queue("transacoes_extrato", "await", { data: [], error: null });
    queue("lancamentos_contabeis", "await", { data: null, error: { message: "falha" } });
    const res = criarResposta();
    await criarConciliacao(reqBase(), res);
    assert.equal(res.statusCode, 500);
  });

  it("500 e remove a conciliação criada quando falha o insert de pares_conciliacao", async () => {
    queueExtratoValido();
    queue("transacoes_extrato", "await", {
      data: [{ id: "t1", tipo: "credito", valor: 100, data_lancamento: "2026-07-01" }],
      error: null,
    });
    queue("lancamentos_contabeis", "await", { data: [], error: null });
    queue("conciliacoes", "single", { data: { id: CONCILIACAO_ID }, error: null });
    queue("pares_conciliacao", "await", { data: null, error: { message: "falha ao inserir" } });

    let idDeletado = null;
    const originalFromLocal = supabase.from;
    supabase.from = function (tabela) {
      const b = originalFromLocal(tabela);
      if (tabela === "conciliacoes") {
        const deleteOriginal = b.delete.bind(b);
        b.delete = () => {
          const deletado = deleteOriginal();
          const eqOriginal = deletado.eq.bind(deletado);
          deletado.eq = (campo, valor) => { if (campo === "id") idDeletado = valor; return eqOriginal(campo, valor); };
          return deletado;
        };
      }
      return b;
    };
    queue("conciliacoes", "await", { data: null, error: null }); // delete

    const res = criarResposta();
    await criarConciliacao(reqBase(), res);
    supabase.from = originalFromLocal;

    assert.equal(res.statusCode, 500);
    assert.equal(idDeletado, CONCILIACAO_ID);
  });

  it("sem transações e sem lançamentos → 201 com todos os totais zerados e nenhum par inserido", async () => {
    queueExtratoValido();
    queue("transacoes_extrato", "await", { data: [], error: null });
    queue("lancamentos_contabeis", "await", { data: [], error: null });
    queue("conciliacoes", "single", { data: { id: CONCILIACAO_ID }, error: null });

    const res = criarResposta();
    await criarConciliacao(reqBase(), res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.total_transacoes, 0);
    assert.equal(res.body.automaticos, 0);
    assert.equal(res.body.provaveis, 0);
    assert.equal(res.body.sem_par, 0);
  });
});
