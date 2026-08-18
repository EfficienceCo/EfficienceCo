import { describe, it, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import supabase from "../src/config/database.js";
import { PERFIS } from "../src/config/perfis.js";
import { confirmarPar, rejeitarPar, concluirConciliacao } from "../src/controllers/conciliacoes.controller.js";

const CLIENTE_A = "11111111-1111-1111-1111-111111111111";
const CLIENTE_B = "22222222-2222-2222-2222-222222222222";
const CONCILIACAO_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const PAR_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const USUARIO_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";

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
    in() { return builder; },
    is() { return builder; },
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
    usuario: { id: USUARIO_ID, perfil: PERFIS.ADMIN_CLIENTE, cliente_id: CLIENTE_A },
    params: { id: CONCILIACAO_ID, pareId: PAR_ID },
    body: {},
    query: {},
    ...overrides,
  };
}

function queueConciliacaoValida(overrides = {}) {
  queue("conciliacoes", "maybeSingle", {
    data: {
      id: CONCILIACAO_ID,
      cliente_id: CLIENTE_A,
      status: "em_andamento",
      total_conciliadas: 1,
      total_pendentes: 2,
      ...overrides,
    },
    error: null,
  });
}

function queueParValido(overrides = {}) {
  queue("pares_conciliacao", "maybeSingle", {
    data: {
      id: PAR_ID,
      conciliacao_id: CONCILIACAO_ID,
      transacao_id: "t1",
      lancamento_id: "l1",
      confianca: "provavel",
      confirmado_em: null,
      ...overrides,
    },
    error: null,
  });
}

// ---------------------------------------------------------------------------
// PATCH /conciliacoes/:id/pares/:pareId/confirmar
// ---------------------------------------------------------------------------

describe("PATCH /conciliacoes/:id/pares/:pareId/confirmar", () => {
  it("200: confirma o par e atualiza os totais da conciliação", async () => {
    queueConciliacaoValida();
    queueParValido();

    let parAtualizado = null;
    let conciliacaoAtualizada = null;
    const originalFromLocal = supabase.from;
    supabase.from = function (tabela) {
      const b = originalFromLocal(tabela);
      if (tabela === "pares_conciliacao") {
        const updateOriginal = b.update.bind(b);
        b.update = (campos) => { parAtualizado = campos; return updateOriginal(campos); };
      }
      if (tabela === "conciliacoes") {
        const updateOriginal = b.update.bind(b);
        b.update = (campos) => { conciliacaoAtualizada = campos; return updateOriginal(campos); };
      }
      return b;
    };

    queue("pares_conciliacao", "await", { data: null, error: null }); // update do par
    queue("conciliacoes", "maybeSingle", {
      data: { total_conciliadas: 1, total_pendentes: 2 },
      error: null,
    }); // re-leitura dos totais antes do update
    queue("conciliacoes", "await", { data: null, error: null }); // update da conciliacao

    const res = criarResposta();
    await confirmarPar(reqBase(), res);
    supabase.from = originalFromLocal;

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.confianca, "provavel");
    assert.equal(res.body.confirmado_por, USUARIO_ID);

    assert.equal(parAtualizado.confirmado_por, USUARIO_ID);
    assert.ok(parAtualizado.confirmado_em);

    assert.equal(conciliacaoAtualizada.total_conciliadas, 2);
    assert.equal(conciliacaoAtualizada.total_pendentes, 1);
  });

  it("500 e desfaz a confirmação do par quando falha o update dos totais", async () => {
    queueConciliacaoValida();
    queueParValido();
    queue("pares_conciliacao", "await", { data: null, error: null }); // update do par (sucesso)
    queue("conciliacoes", "maybeSingle", {
      data: { total_conciliadas: 1, total_pendentes: 2 },
      error: null,
    });
    queue("conciliacoes", "await", { data: null, error: { message: "falha ao atualizar totais" } });

    let parRevertido = null;
    let chamadas = 0;
    const originalFromLocal = supabase.from;
    supabase.from = function (tabela) {
      const b = originalFromLocal(tabela);
      if (tabela === "pares_conciliacao") {
        const updateOriginal = b.update.bind(b);
        b.update = (campos) => {
          chamadas += 1;
          if (chamadas === 2) parRevertido = campos;
          return updateOriginal(campos);
        };
      }
      return b;
    };
    queue("pares_conciliacao", "await", { data: null, error: null }); // update de reversão

    const res = criarResposta();
    await confirmarPar(reqBase(), res);
    supabase.from = originalFromLocal;

    assert.equal(res.statusCode, 500);
    assert.equal(parRevertido.confirmado_por, null);
    assert.equal(parRevertido.confirmado_em, null);
  });

  it("400 quando cliente_id não pode ser resolvido", async () => {
    const res = criarResposta();
    await confirmarPar(reqBase({ usuario: { id: USUARIO_ID, perfil: PERFIS.ADMIN_EFFICIENCE } }), res);
    assert.equal(res.statusCode, 400);
  });

  it("404 quando a conciliação não existe", async () => {
    queue("conciliacoes", "maybeSingle", { data: null, error: null });
    const res = criarResposta();
    await confirmarPar(reqBase(), res);
    assert.equal(res.statusCode, 404);
  });

  it("404 quando a conciliação pertence a outro cliente", async () => {
    queueConciliacaoValida({ cliente_id: CLIENTE_B });
    const res = criarResposta();
    await confirmarPar(reqBase(), res);
    assert.equal(res.statusCode, 404);
  });

  it("404 quando o par não existe", async () => {
    queueConciliacaoValida();
    queue("pares_conciliacao", "maybeSingle", { data: null, error: null });
    const res = criarResposta();
    await confirmarPar(reqBase(), res);
    assert.equal(res.statusCode, 404);
  });

  it("409 quando o par não tem confiança 'provavel'", async () => {
    queueConciliacaoValida();
    queueParValido({ confianca: "automatico" });
    const res = criarResposta();
    await confirmarPar(reqBase(), res);
    assert.equal(res.statusCode, 409);
  });

  it("409 quando o par já foi confirmado", async () => {
    queueConciliacaoValida();
    queueParValido({ confirmado_em: "2026-08-01T00:00:00.000Z" });
    const res = criarResposta();
    await confirmarPar(reqBase(), res);
    assert.equal(res.statusCode, 409);
  });
});

// ---------------------------------------------------------------------------
// PATCH /conciliacoes/:id/pares/:pareId/rejeitar
// ---------------------------------------------------------------------------

describe("PATCH /conciliacoes/:id/pares/:pareId/rejeitar", () => {
  it("200: descarta o par (lancamento_id=null, confianca=sem_par)", async () => {
    queueConciliacaoValida();
    queueParValido();

    let parAtualizado = null;
    const originalFromLocal = supabase.from;
    supabase.from = function (tabela) {
      const b = originalFromLocal(tabela);
      if (tabela === "pares_conciliacao") {
        const updateOriginal = b.update.bind(b);
        b.update = (campos) => { parAtualizado = campos; return updateOriginal(campos); };
      }
      return b;
    };
    queue("pares_conciliacao", "await", { data: null, error: null });

    const res = criarResposta();
    await rejeitarPar(reqBase(), res);
    supabase.from = originalFromLocal;

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.confianca, "sem_par");
    assert.equal(parAtualizado.lancamento_id, null);
    assert.equal(parAtualizado.confianca, "sem_par");
  });

  it("404 quando a conciliação pertence a outro cliente", async () => {
    queueConciliacaoValida({ cliente_id: CLIENTE_B });
    const res = criarResposta();
    await rejeitarPar(reqBase(), res);
    assert.equal(res.statusCode, 404);
  });

  it("404 quando o par não existe", async () => {
    queueConciliacaoValida();
    queue("pares_conciliacao", "maybeSingle", { data: null, error: null });
    const res = criarResposta();
    await rejeitarPar(reqBase(), res);
    assert.equal(res.statusCode, 404);
  });

  it("409 quando o par não tem confiança 'provavel'", async () => {
    queueConciliacaoValida();
    queueParValido({ confianca: "sem_par" });
    const res = criarResposta();
    await rejeitarPar(reqBase(), res);
    assert.equal(res.statusCode, 409);
  });
});

// ---------------------------------------------------------------------------
// POST /conciliacoes/:id/concluir
// ---------------------------------------------------------------------------

describe("POST /conciliacoes/:id/concluir", () => {
  it("200: conclui a conciliação e marca transações/lançamentos como conciliados", async () => {
    queueConciliacaoValida();
    queue("pares_conciliacao", "await", {
      data: [
        { transacao_id: "t1", lancamento_id: "l1", confianca: "automatico", confirmado_em: null },
        { transacao_id: "t2", lancamento_id: "l2", confianca: "provavel", confirmado_em: "2026-08-01T00:00:00.000Z" },
        { transacao_id: "t3", lancamento_id: null, confianca: "sem_par", confirmado_em: null },
      ],
      error: null,
    });

    let conciliacaoAtualizada = null;
    let transacoesAtualizadas = null;
    let lancamentosAtualizados = null;
    const originalFromLocal = supabase.from;
    supabase.from = function (tabela) {
      const b = originalFromLocal(tabela);
      if (tabela === "conciliacoes") {
        const updateOriginal = b.update.bind(b);
        b.update = (campos) => { conciliacaoAtualizada = campos; return updateOriginal(campos); };
      }
      if (tabela === "transacoes_extrato") {
        const updateOriginal = b.update.bind(b);
        b.update = (campos) => {
          const chain = updateOriginal(campos);
          const inOriginal = chain.in.bind(chain);
          chain.in = (coluna, valores) => { transacoesAtualizadas = valores; return inOriginal(coluna, valores); };
          return chain;
        };
      }
      if (tabela === "lancamentos_contabeis") {
        const updateOriginal = b.update.bind(b);
        b.update = (campos) => {
          const chain = updateOriginal(campos);
          const inOriginal = chain.in.bind(chain);
          chain.in = (coluna, valores) => { lancamentosAtualizados = valores; return inOriginal(coluna, valores); };
          return chain;
        };
      }
      return b;
    };
    queue("conciliacoes", "await", { data: null, error: null }); // update status
    queue("transacoes_extrato", "await", { data: null, error: null });
    queue("lancamentos_contabeis", "await", { data: null, error: null });

    const res = criarResposta();
    await concluirConciliacao(reqBase(), res);
    supabase.from = originalFromLocal;

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, "concluida");
    assert.equal(res.body.total_conciliadas, 2);

    assert.equal(conciliacaoAtualizada.status, "concluida");
    assert.ok(conciliacaoAtualizada.concluida_em);

    assert.deepEqual(transacoesAtualizadas.sort(), ["t1", "t2"]);
    assert.deepEqual(lancamentosAtualizados.sort(), ["l1", "l2"]);
  });

  it("400 quando cliente_id não pode ser resolvido", async () => {
    const res = criarResposta();
    await concluirConciliacao(reqBase({ usuario: { id: USUARIO_ID, perfil: PERFIS.ADMIN_EFFICIENCE } }), res);
    assert.equal(res.statusCode, 400);
  });

  it("404 quando a conciliação pertence a outro cliente", async () => {
    queueConciliacaoValida({ cliente_id: CLIENTE_B });
    const res = criarResposta();
    await concluirConciliacao(reqBase(), res);
    assert.equal(res.statusCode, 404);
  });

  it("409 quando a conciliação já foi concluída", async () => {
    queueConciliacaoValida({ status: "concluida" });
    const res = criarResposta();
    await concluirConciliacao(reqBase(), res);
    assert.equal(res.statusCode, 409);
  });

  it("409 quando há pares prováveis pendentes de decisão", async () => {
    queueConciliacaoValida();
    queue("pares_conciliacao", "await", {
      data: [{ transacao_id: "t4", lancamento_id: "l4", confianca: "provavel", confirmado_em: null }],
      error: null,
    });
    const res = criarResposta();
    await concluirConciliacao(reqBase(), res);
    assert.equal(res.statusCode, 409);
  });

  it("200: sem pares conciliados não atualiza transações nem lançamentos", async () => {
    queueConciliacaoValida();
    queue("pares_conciliacao", "await", {
      data: [{ transacao_id: "t3", lancamento_id: null, confianca: "sem_par", confirmado_em: null }],
      error: null,
    });
    queue("conciliacoes", "await", { data: null, error: null });

    const res = criarResposta();
    await concluirConciliacao(reqBase(), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.total_conciliadas, 0);
  });
});
