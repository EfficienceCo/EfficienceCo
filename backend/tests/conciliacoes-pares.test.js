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

const originalRpc = supabase.rpc;
const chamadasRpc = [];
let respostaRpc = { data: null, error: null };
supabase.rpc = function (nome, args) {
  chamadasRpc.push({ nome, args });
  return Promise.resolve(respostaRpc);
};

after(() => {
  supabase.from = originalFrom;
  supabase.rpc = originalRpc;
});

beforeEach(() => {
  filas.clear();
  chamadasRpc.length = 0;
  respostaRpc = { data: null, error: null };
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
// POST /conciliacoes/:id/concluir
// ---------------------------------------------------------------------------

describe("POST /conciliacoes/:id/concluir", () => {
  it("409 quando um lançamento já foi conciliado em outra conciliação concluída (#691)", async () => {
    queueConciliacaoValida();
    queue("pares_conciliacao", "await", {
      data: [{ transacao_id: "t1", lancamento_id: "l1", confianca: "automatico", confirmado_em: null }],
      error: null,
    });
    queue("pares_conciliacao", "await", {
      data: [{ lancamento_id: "l1", conciliacoes: { mes: 7, ano: 2026 } }],
      error: null,
    });

    const escritas = [];
    const originalFromLocal = supabase.from;
    supabase.from = function (tabela) {
      const b = originalFromLocal(tabela);
      const updateOriginal = b.update.bind(b);
      b.update = (campos) => { escritas.push(tabela); return updateOriginal(campos); };
      return b;
    };

    const res = criarResposta();
    await concluirConciliacao(reqBase(), res);
    supabase.from = originalFromLocal;

    assert.equal(res.statusCode, 409);
    assert.match(res.body.erro, /já foram conciliados em outra conciliação concluída \(07\/2026\)/);
    assert.deepEqual(res.body.lancamento_ids, ["l1"]);
    assert.deepEqual(escritas, []); // nada foi marcado como conciliado nem concluído
  });

  it("confere os lançamentos já conciliados em lotes de até 100 ids (#691)", async () => {
    queueConciliacaoValida();
    queue("pares_conciliacao", "await", {
      data: Array.from({ length: 150 }, (_, i) => ({
        transacao_id: `t${i}`, lancamento_id: `l${i}`, confianca: "automatico", confirmado_em: null,
      })),
      error: null,
    });
    queue("pares_conciliacao", "await", { data: [], error: null });
    queue("pares_conciliacao", "await", { data: [], error: null });

    const tamanhosDosLotes = [];
    const originalFromLocal = supabase.from;
    supabase.from = function (tabela) {
      const b = originalFromLocal(tabela);
      if (tabela === "pares_conciliacao") {
        const inOriginal = b.in.bind(b);
        b.in = (coluna, valores) => {
          if (coluna === "lancamento_id") tamanhosDosLotes.push(valores.length);
          return inOriginal(coluna, valores);
        };
      }
      return b;
    };

    const res = criarResposta();
    await concluirConciliacao(reqBase(), res);
    supabase.from = originalFromLocal;

    assert.equal(res.statusCode, 200);
    assert.deepEqual(tamanhosDosLotes, [100, 50]);
  });

  it("500 quando falha a conferência de lançamentos já conciliados", async () => {
    queueConciliacaoValida();
    queue("pares_conciliacao", "await", {
      data: [{ transacao_id: "t1", lancamento_id: "l1", confianca: "automatico", confirmado_em: null }],
      error: null,
    });
    queue("pares_conciliacao", "await", { data: null, error: { message: "falha" } });
    const res = criarResposta();
    await concluirConciliacao(reqBase(), res);
    assert.equal(res.statusCode, 500);
  });
});

// ---------------------------------------------------------------------------
// PATCH /conciliacoes/:id/pares/:pareId/confirmar
// ---------------------------------------------------------------------------

describe("PATCH /conciliacoes/:id/pares/:pareId/confirmar", () => {
  it("200: confirma o par numa chamada só ao banco (decisão + totais)", async () => {
    queueConciliacaoValida();
    queueParValido();
    respostaRpc = { data: true, error: null };

    const res = criarResposta();
    await confirmarPar(reqBase(), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.confianca, "provavel");
    assert.equal(res.body.confirmado_por, USUARIO_ID);
    assert.deepEqual(chamadasRpc, [
      {
        nome: "confirmar_par_conciliacao",
        args: { p_conciliacao_id: CONCILIACAO_ID, p_par_id: PAR_ID, p_usuario_id: USUARIO_ID },
      },
    ]);
  });

  it("409 quando outro pedido já decidiu o par (function devolve false)", async () => {
    queueConciliacaoValida();
    queueParValido();
    respostaRpc = { data: false, error: null };

    const res = criarResposta();
    await confirmarPar(reqBase(), res);

    assert.equal(res.statusCode, 409);
  });

  it("500 quando a function falha (o banco desfaz a decisão, o backend não escreve nada)", async () => {
    queueConciliacaoValida();
    queueParValido();
    respostaRpc = { data: null, error: { message: "falha ao atualizar totais" } };

    const escritas = [];
    const originalFromLocal = supabase.from;
    supabase.from = function (tabela) {
      const b = originalFromLocal(tabela);
      for (const metodo of ["insert", "update", "delete"]) {
        const original = b[metodo].bind(b);
        b[metodo] = (campos) => { escritas.push({ tabela, metodo }); return original(campos); };
      }
      return b;
    };

    const res = criarResposta();
    await confirmarPar(reqBase(), res);
    supabase.from = originalFromLocal;

    assert.equal(res.statusCode, 500);
    assert.equal(escritas.length, 0);
  });
});

// ---------------------------------------------------------------------------
// PATCH /conciliacoes/:id/pares/:pareId/rejeitar
// ---------------------------------------------------------------------------

describe("PATCH /conciliacoes/:id/pares/:pareId/rejeitar", () => {
  it("200: devolve o par do lançamento criado pela function (lançamento não some)", async () => {
    queueConciliacaoValida();
    queueParValido();
    respostaRpc = { data: "novo-par", error: null };

    const res = criarResposta();
    await rejeitarPar(reqBase(), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.confianca, "sem_par");
    assert.deepEqual(res.body.par_lancamento, { id: "novo-par", lancamento_id: "l1", confianca: "sem_par" });
    // total_pendentes conta só transações: a transação segue pendente, então não há recálculo de totais
    assert.deepEqual(chamadasRpc, [
      { nome: "rejeitar_par_conciliacao", args: { p_conciliacao_id: CONCILIACAO_ID, p_par_id: PAR_ID } },
    ]);
  });

  it("500 quando a function falha", async () => {
    queueConciliacaoValida();
    queueParValido();
    respostaRpc = { data: null, error: { message: "falha" } };

    const res = criarResposta();
    await rejeitarPar(reqBase(), res);

    assert.equal(res.statusCode, 500);
  });

  it("409 quando outro pedido já decidiu o par (function devolve NULL)", async () => {
    queueConciliacaoValida();
    queueParValido();
    respostaRpc = { data: null, error: null };

    const res = criarResposta();
    await rejeitarPar(reqBase(), res);

    assert.equal(res.statusCode, 409);
  });
});

// ---------------------------------------------------------------------------
// Problemas já achados (catálogo do TEST-7, vault: referencias/catalogo-problemas-viram-teste-2026-10)
// ---------------------------------------------------------------------------

describe("Pares e conclusão — problemas já achados", () => {
  // PRB-C-16 (#327): a conciliação virava 'concluida' antes de marcar
  // conciliado=true; se a marcação falhava, não havia como tentar de novo.
  for (const tabelaQueFalha of ["transacoes_extrato", "lancamentos_contabeis"]) {
    it(`concluir: 500 sem mudar o status quando falha a marcação em ${tabelaQueFalha} (PRB-C-16)`, async () => {
      queueConciliacaoValida();
      queue("pares_conciliacao", "await", {
        data: [{ transacao_id: "t1", lancamento_id: "l1", confianca: "automatico", confirmado_em: null }],
        error: null,
      });
      queue(tabelaQueFalha, "await", { data: null, error: { message: "falha" } });

      let statusGravado = null;
      const originalFromLocal = supabase.from;
      supabase.from = function (tabela) {
        const b = originalFromLocal(tabela);
        if (tabela === "conciliacoes") {
          const updateOriginal = b.update.bind(b);
          b.update = (campos) => { statusGravado = campos.status; return updateOriginal(campos); };
        }
        return b;
      };

      const res = criarResposta();
      await concluirConciliacao(reqBase(), res);
      supabase.from = originalFromLocal;

      assert.equal(res.statusCode, 500);
      assert.equal(statusGravado, null, "a conciliação tem que continuar em_andamento para o retry");
    });
  }
});
