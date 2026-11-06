import { describe, it, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import supabase from "../src/config/database.js";
import { PERFIS } from "../src/config/perfis.js";
import { criarConciliacao } from "../src/controllers/conciliacoes.controller.js";
import { TAMANHO_PAGINA_POSTGREST } from "../src/utils/paginacao.util.js";

const CLIENTE_A = "11111111-1111-1111-1111-111111111111";
const CLIENTE_B = "22222222-2222-2222-2222-222222222222";
const EXTRATO_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CONCILIACAO_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

// ---------------------------------------------------------------------------
// Mock de supabase
// ---------------------------------------------------------------------------

const originalFrom = supabase.from;
const filas = new Map();
// Registra os pares (coluna, valor) de cada .eq() encadeado, por tabela — usado
// pra provar que a consulta de conciliações existentes do extrato NÃO filtra
// por status (regressão: filtrar só 'em_andamento' deixava uma segunda sessão
// ser criada pra um extrato já conciliado, duplicando pares/totais).
const chamadasEq = new Map();
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
    eq(coluna, valor) {
      if (!chamadasEq.has(tabela)) chamadasEq.set(tabela, []);
      chamadasEq.get(tabela).push([coluna, valor]);
      return builder;
    },
    gte() { return builder; },
    in() { return builder; },
    lte() { return builder; },
    order() { return builder; },
    range() { return builder; },
    limit() { return Promise.resolve(consumir("limit", { data: [], error: null })); },
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

beforeEach(() => {
  filas.clear();
  chamadasEq.clear();
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

  it("matching enxerga lançamento além do teto de 1000 do PostgREST (PRB-C-09, #696)", async () => {
    queueExtratoValido();
    queue("transacoes_extrato", "await", { data: [], error: null });
    queue("lancamentos_contabeis", "await", {
      data: Array.from({ length: TAMANHO_PAGINA_POSTGREST }, (_, i) => ({ id: `l${i}` })),
      error: null,
    });
    queue("lancamentos_contabeis", "await", {
      data: [{ id: "l-alem-do-teto" }],
      error: null,
    });
    queue("conciliacoes", "single", { data: { id: CONCILIACAO_ID }, error: null });
    queue("pares_conciliacao", "await", { data: [], error: null });

    const res = criarResposta();
    await criarConciliacao(reqBase(), res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.sem_par, TAMANHO_PAGINA_POSTGREST + 1);
  });

  it("500 quando falha a busca de transações do extrato", async () => {
    queueExtratoValido();
    queue("transacoes_extrato", "await", { data: null, error: { message: "falha" } });
    const res = criarResposta();
    await criarConciliacao(reqBase(), res);
    assert.equal(res.statusCode, 500);
  });

  it("lançamento que já tem par numa conciliação em andamento de outro extrato fica fora do matching (#691)", async () => {
    queueExtratoValido();
    queue("transacoes_extrato", "await", {
      data: [{ id: "t1", tipo: "credito", valor: 100, data_lancamento: "2026-07-01" }],
      error: null,
    });
    queue("lancamentos_contabeis", "await", {
      data: [{ id: "l1", tipo: "credito", valor: 100, data_lancamento: "2026-07-01" }],
      error: null,
    });
    // l1 já está casado na conciliação em andamento do outro extrato
    queue("pares_conciliacao", "await", { data: [{ lancamento_id: "l1" }], error: null });
    queue("conciliacoes", "single", { data: { id: CONCILIACAO_ID }, error: null });

    let paresInseridos = null;
    const originalFromLocal = supabase.from;
    supabase.from = function (tabela) {
      const b = originalFromLocal(tabela);
      if (tabela === "pares_conciliacao") {
        const insertOriginal = b.insert.bind(b);
        b.insert = (linhas) => { paresInseridos = linhas; return insertOriginal(linhas); };
      }
      return b;
    };

    const res = criarResposta();
    await criarConciliacao(reqBase(), res);
    supabase.from = originalFromLocal;

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.automaticos, 0);
    assert.equal(res.body.lancamentos_em_outra_conciliacao, 1);
    // t1 vira sem_par: l1 não pode ser casado de novo
    assert.deepEqual(
      paresInseridos.map((p) => [p.transacao_id, p.lancamento_id, p.confianca]),
      [["t1", null, "sem_par"]],
    );
  });

  it("consulta os lançamentos em outras conciliações em lotes de até 100 ids (#691)", async () => {
    queueExtratoValido();
    queue("transacoes_extrato", "await", { data: [], error: null });
    const lancamentos = Array.from({ length: 250 }, (_, i) => ({
      id: `l${i}`, tipo: "credito", valor: 10, data_lancamento: "2026-07-01",
    }));
    queue("lancamentos_contabeis", "await", { data: lancamentos, error: null });
    queue("pares_conciliacao", "await", { data: [], error: null });
    queue("pares_conciliacao", "await", { data: [{ lancamento_id: "l150" }], error: null }); // 2º lote
    queue("pares_conciliacao", "await", { data: [], error: null });
    queue("conciliacoes", "single", { data: { id: CONCILIACAO_ID }, error: null });

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
    await criarConciliacao(reqBase(), res);
    supabase.from = originalFromLocal;

    assert.equal(res.statusCode, 201);
    assert.deepEqual(tamanhosDosLotes, [100, 100, 50]);
    assert.equal(res.body.lancamentos_em_outra_conciliacao, 1); // o do 2º lote também conta
  });

  it("500 quando falha a busca de lançamentos em outras conciliações", async () => {
    queueExtratoValido();
    queue("transacoes_extrato", "await", { data: [], error: null });
    queue("lancamentos_contabeis", "await", {
      data: [{ id: "l1", tipo: "credito", valor: 100, data_lancamento: "2026-07-01" }],
      error: null,
    });
    queue("pares_conciliacao", "await", { data: null, error: { message: "falha" } });
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

  it("409 e remove a conciliação quando outra grava o mesmo lançamento ao mesmo tempo (índice único)", async () => {
    queueExtratoValido();
    queue("transacoes_extrato", "await", {
      data: [{ id: "t1", tipo: "credito", valor: 100, data_lancamento: "2026-07-01" }],
      error: null,
    });
    queue("lancamentos_contabeis", "await", { data: [], error: null });
    queue("conciliacoes", "single", { data: { id: CONCILIACAO_ID }, error: null });
    queue("pares_conciliacao", "await", { data: null, error: { code: "23505", message: "duplicate key" } });

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

    assert.equal(res.statusCode, 409);
    assert.equal(idDeletado, CONCILIACAO_ID);
  });
});

// ---------------------------------------------------------------------------
// Problemas já achados (catálogo do TEST-7, vault: referencias/catalogo-problemas-viram-teste-2026-10)
// ---------------------------------------------------------------------------

describe("POST /conciliacoes — problemas já achados", () => {
  // PRB-C-20 (#326): ano=0 passava na validação e o filtro de período abria o
  // histórico inteiro de lançamentos do cliente para o matching.
  it("400 quando ano=0, sem consultar extrato nem lançamentos (PRB-C-20)", async () => {
    const res = criarResposta();
    await criarConciliacao(reqBase({ body: { extrato_id: EXTRATO_ID, mes: 7, ano: 0 } }), res);
    assert.equal(res.statusCode, 400);
    assert.equal(chamadasEq.size, 0, "não deveria chegar ao banco");
  });

  // BUG (PRB-C-21, sem issue; reconferido contra a main em 2026-11-04): o 409 de
  // "já existe conciliação para o extrato" é uma leitura antes do insert. Dois
  // cliques simultâneos passam os dois pela leitura; nenhuma migration (até a 108)
  // cria UNIQUE em conciliacoes.extrato_id, e o controller trata qualquer erro do
  // insert da conciliação como 500 (só o insert dos pares trata 23505).
  // Esperado: o banco recusa a segunda (unique_violation) e a API devolve 409.
  // O critério real é "duplo clique nunca cria duas conciliações"; se a correção
  // for por RPC ou lock, ajustar este caso ao desenho escolhido (TEST-9).
  it.skip("409 quando o insert da conciliação colide por unique_violation (duplo clique, PRB-C-21)", async () => {
    queueExtratoValido();
    queue("transacoes_extrato", "await", { data: [], error: null });
    queue("lancamentos_contabeis", "await", { data: [], error: null });
    queue("conciliacoes", "single", {
      data: null,
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    });

    const res = criarResposta();
    await criarConciliacao(reqBase(), res);

    assert.equal(res.statusCode, 409);
  });

  // #691 (corrigido): o matching só excluía lançamento com conciliado=true, que só é
  // marcado ao CONCLUIR; um lançamento casado numa conciliação em_andamento de outro
  // extrato do mesmo período era casado de novo. Agora o controller consulta os pares
  // ativos de outras conciliações em andamento e tira esses lançamentos do matching.
  // Exige a criação com sucesso (201) e os pares gravados ANTES de conferir o l1:
  // sem isso, uma resposta 500 também "passava" (nenhum par inserido).
  it("lançamento casado em conciliação em_andamento de outro extrato não é casado de novo (PRB-C-04, #691)", async () => {
    queueExtratoValido();
    queue("transacoes_extrato", "await", {
      data: [{ id: "t1", tipo: "credito", valor: 100, data_lancamento: "2026-07-01", conciliado: false }],
      error: null,
    });
    queue("lancamentos_contabeis", "await", {
      data: [{ id: "l1", tipo: "credito", valor: 100, data_lancamento: "2026-07-01", conciliado: false }],
      error: null,
    });
    // l1 já está num par automático de outra conciliação em_andamento
    queue("pares_conciliacao", "await", {
      data: [{ conciliacao_id: "outra-conciliacao", transacao_id: "t-outro-extrato", lancamento_id: "l1", confianca: "automatico" }],
      error: null,
    });
    queue("conciliacoes", "single", { data: { id: CONCILIACAO_ID }, error: null });

    let paresInseridos = [];
    const originalFromLocal = supabase.from;
    supabase.from = function (tabela) {
      const b = originalFromLocal(tabela);
      if (tabela === "pares_conciliacao") {
        const insertOriginal = b.insert.bind(b);
        b.insert = (linhas) => { paresInseridos = linhas; return insertOriginal(linhas); };
      }
      return b;
    };

    const res = criarResposta();
    await criarConciliacao(reqBase(), res);
    supabase.from = originalFromLocal;

    assert.equal(res.statusCode, 201, JSON.stringify(res.body));
    assert.equal(res.body.lancamentos_em_outra_conciliacao, 1);
    assert.ok(paresInseridos.length > 0, "a conciliação precisa gravar os pares (t1 fica sem par)");
    assert.ok(
      paresInseridos.every((p) => p.lancamento_id !== "l1"),
      "l1 não pode ser casado em duas conciliações",
    );
    assert.ok(
      paresInseridos.some((p) => p.transacao_id === "t1" && p.confianca === "sem_par"),
      "t1 não casa com o l1 que está em outra conciliação",
    );
  });
});
