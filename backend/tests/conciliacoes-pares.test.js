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
  // PRB-C-18 (#327): rejeitarPar não olhava confirmado_em e "desconfirmava" um
  // provável já confirmado, voltando a transação para pendente.
  it("rejeitar: 409 quando o par já foi confirmado, sem escrever nada (PRB-C-18)", async () => {
    queueConciliacaoValida();
    queueParValido({ confirmado_em: "2026-08-01T00:00:00.000Z" });
    // A RPC diria "ok": só a checagem prévia de confirmado_em pode produzir o 409.
    respostaRpc = { data: "novo-par", error: null };

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
    await rejeitarPar(reqBase(), res);
    supabase.from = originalFromLocal;

    assert.equal(res.statusCode, 409);
    assert.deepEqual(escritas, []);
  });

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

// Banco em memória com estado para os casos de paralelismo: cada consulta
// cede a vez (setImmediate) como uma ida ao banco de verdade, então dois pedidos
// em Promise.all intercalam as leituras do controller. Filtros de update
// (.eq/.is/.in) valem de verdade.
// As decisões de par (#690, migration 105) acontecem no banco, em
// confirmar_par_conciliacao / rejeitar_par_conciliacao; `rpcEmMemoria` imita as duas
// functions sobre as mesmas tabelas e roda sem ceder a vez, como a transação do
// Postgres (condição, escrita e recálculo dos totais de uma vez). Mesma simulação de
// conciliacoes-pares-concorrencia.test.js. Prova o que o controller faz com o
// resultado (200/409, nada escrito fora da function); NÃO prova o SQL nem o lock —
// isso é do teste com banco real (backend/tests/conciliacao/pares.test.js).
function bancoEmMemoria(tabelas) {
  return function from(tabela) {
    const linhas = tabelas[tabela] ?? (tabelas[tabela] = []);
    let operacao = "select";
    let payload = null;
    let devolverLinhas = false;
    const filtros = [];
    const casa = (linha) => filtros.every((filtro) => filtro(linha));

    async function executar() {
      await new Promise((resolve) => setImmediate(resolve));
      if (operacao === "select") {
        return { data: linhas.filter(casa).map((l) => ({ ...l })), error: null };
      }
      if (operacao === "update") {
        const alvo = linhas.filter(casa);
        alvo.forEach((linha) => Object.assign(linha, payload));
        return { data: devolverLinhas ? alvo.map((l) => ({ ...l })) : null, error: null, count: alvo.length };
      }
      if (operacao === "insert") {
        const novas = [].concat(payload).map((l, i) => ({ id: `novo-${linhas.length + i}`, confirmado_em: null, ...l }));
        linhas.push(...novas);
        return { data: devolverLinhas ? novas.map((l) => ({ ...l })) : null, error: null };
      }
      const restantes = linhas.filter((l) => !casa(l));
      linhas.splice(0, linhas.length, ...restantes);
      return { data: null, error: null };
    }

    const umaLinha = async () => {
      const r = await executar();
      return { ...r, data: Array.isArray(r.data) ? r.data[0] ?? null : r.data };
    };

    const b = {
      select() { if (operacao !== "select") devolverLinhas = true; return b; },
      insert(p) { operacao = "insert"; payload = p; return b; },
      update(p) { operacao = "update"; payload = p; return b; },
      delete() { operacao = "delete"; return b; },
      eq(coluna, valor) { filtros.push((l) => l[coluna] === valor); return b; },
      is(coluna, valor) { filtros.push((l) => (l[coluna] ?? null) === valor); return b; },
      in(coluna, valores) { filtros.push((l) => valores.includes(l[coluna])); return b; },
      maybeSingle: umaLinha,
      single: umaLinha,
      then(resolve, reject) { return executar().then(resolve, reject); },
    };
    return b;
  };
}

// Imita as functions da migration 105 (SQL: database/migrations/105.sql). O recálculo
// segue recalcular_totais_conciliacao: conciliadas = automáticos + prováveis confirmados;
// pendentes = prováveis sem decisão + 'sem_par' que ainda têm transação.
function rpcEmMemoria(tabelas) {
  const recalcular = (conciliacaoId) => {
    const pares = tabelas.pares_conciliacao;
    const conciliacao = tabelas.conciliacoes.find((c) => c.id === conciliacaoId);
    conciliacao.total_conciliadas = pares.filter(
      (p) => p.confianca === "automatico" || (p.confianca === "provavel" && p.confirmado_em),
    ).length;
    conciliacao.total_pendentes = pares.filter(
      (p) => (p.confianca === "provavel" && !p.confirmado_em) || (p.confianca === "sem_par" && p.transacao_id),
    ).length;
  };

  return async function rpc(nome, args) {
    await new Promise((resolve) => setImmediate(resolve)); // ida ao banco; daqui até o return é atômico
    const par = tabelas.pares_conciliacao.find(
      (p) => p.id === args.p_par_id && p.conciliacao_id === args.p_conciliacao_id,
    );
    const disponivel = Boolean(par) && par.confianca === "provavel" && !par.confirmado_em;

    if (nome === "confirmar_par_conciliacao") {
      if (!disponivel) return { data: false, error: null };
      par.confirmado_por = args.p_usuario_id;
      par.confirmado_em = "2026-08-01T00:00:00.000Z";
      recalcular(args.p_conciliacao_id);
      return { data: true, error: null };
    }

    assert.equal(nome, "rejeitar_par_conciliacao");
    if (!disponivel) return { data: null, error: null };
    const lancamentoId = par.lancamento_id;
    Object.assign(par, { lancamento_id: null, confianca: "sem_par" });
    const novo = {
      id: `novo-${tabelas.pares_conciliacao.length}`, conciliacao_id: args.p_conciliacao_id,
      transacao_id: null, lancamento_id: lancamentoId, confianca: "sem_par", confirmado_em: null,
    };
    tabelas.pares_conciliacao.push(novo);
    return { data: novo.id, error: null };
  };
}

describe("Pares em paralelo (#690)", () => {
  const PAR_2 = "cccccccc-cccc-cccc-cccc-ccccccccccc2";
  const PAR_3 = "cccccccc-cccc-cccc-cccc-ccccccccccc3";
  let tabelas;
  let originalFromLocal;
  let originalRpcLocal;

  beforeEach(() => {
    tabelas = {
      conciliacoes: [{
        id: CONCILIACAO_ID, cliente_id: CLIENTE_A, extrato_id: null, mes: 7, ano: 2026,
        status: "em_andamento", total_transacoes: 3, total_conciliadas: 0, total_pendentes: 3,
      }],
      pares_conciliacao: [PAR_ID, PAR_2, PAR_3].map((id, i) => ({
        id, conciliacao_id: CONCILIACAO_ID, transacao_id: `t${i}`, lancamento_id: `l${i}`,
        confianca: "provavel", confirmado_por: null, confirmado_em: null,
      })),
    };
    originalFromLocal = supabase.from;
    originalRpcLocal = supabase.rpc;
    supabase.from = bancoEmMemoria(tabelas);
    supabase.rpc = rpcEmMemoria(tabelas);
  });

  const restaurar = () => {
    supabase.from = originalFromLocal;
    supabase.rpc = originalRpcLocal;
  };
  const chamar = async (acao, pareId = PAR_ID) => {
    const res = criarResposta();
    await acao(reqBase({ params: { id: CONCILIACAO_ID, pareId } }), res);
    return res.statusCode;
  };
  const conciliacao = () => tabelas.conciliacoes[0];
  const paresDoLancamento = (lancamentoId) =>
    tabelas.pares_conciliacao.filter((p) => p.lancamento_id === lancamentoId);

  // Prova que o banco em memória (from + rpc) reproduz o comportamento sequencial
  // — senão o caso de paralelismo abaixo não provaria nada.
  it("sequencial: confirmar e depois rejeitar o mesmo par dá 200 e 409, totais 1/2", async () => {
    try {
      assert.equal(await chamar(confirmarPar), 200);
      assert.equal(await chamar(rejeitarPar), 409);
      assert.equal(conciliacao().total_conciliadas, 1);
      assert.equal(conciliacao().total_pendentes, 2);
      assert.equal(paresDoLancamento("l0").length, 1);
    } finally {
      restaurar();
    }
  });

  // #690 (PRB-C-15): os totais eram lidos e gravados (+1/−1) sem operação atômica e
  // confirmações paralelas de pares diferentes perdiam incrementos. Hoje o recálculo
  // está dentro da function (migration 105).
  // Os demais cenários do #690 (PRB-C-13: 3× confirmar e confirmar × rejeitar do mesmo
  // par; PRB-C-14: rejeitar em duas abas) têm teste equivalente, ativo, em
  // conciliacoes-pares-concorrencia.test.js — não repetidos aqui.
  it("confirmar 3 pares diferentes em paralelo: totais 3/0 (PRB-C-15, #690)", async () => {
    try {
      const status = await Promise.all([PAR_ID, PAR_2, PAR_3].map((id) => chamar(confirmarPar, id)));
      assert.deepEqual(status, [200, 200, 200]);
      assert.equal(conciliacao().total_conciliadas, 3);
      assert.equal(conciliacao().total_pendentes, 0);
    } finally {
      restaurar();
    }
  });
});
