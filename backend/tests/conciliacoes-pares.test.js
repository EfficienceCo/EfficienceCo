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
  // Espiona insert/update/delete de pares_conciliacao e conciliacoes na ordem em que ocorrem.
  function espionarEscritas() {
    const escritas = [];
    const originalFromLocal = supabase.from;
    supabase.from = function (tabela) {
      const b = originalFromLocal(tabela);
      for (const metodo of ["insert", "update", "delete"]) {
        const original = b[metodo].bind(b);
        b[metodo] = (campos) => { escritas.push({ tabela, metodo, campos }); return original(campos); };
      }
      return b;
    };
    return { escritas, restaurar: () => { supabase.from = originalFromLocal; } };
  }

  it("200: separa o par em transação sem par + lançamento sem par (lançamento não some)", async () => {
    queueConciliacaoValida();
    queueParValido();
    queue("pares_conciliacao", "single", { data: { id: "novo-par" }, error: null });
    queue("pares_conciliacao", "await", { data: null, error: null });

    const espiao = espionarEscritas();
    const res = criarResposta();
    await rejeitarPar(reqBase(), res);
    espiao.restaurar();

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.confianca, "sem_par");
    assert.deepEqual(res.body.par_lancamento, { id: "novo-par", lancamento_id: "l1", confianca: "sem_par" });

    const insert = espiao.escritas.find((e) => e.tabela === "pares_conciliacao" && e.metodo === "insert");
    assert.deepEqual(insert.campos, {
      conciliacao_id: CONCILIACAO_ID,
      transacao_id: null,
      lancamento_id: "l1",
      confianca: "sem_par",
    });
    const update = espiao.escritas.find((e) => e.tabela === "pares_conciliacao" && e.metodo === "update");
    assert.deepEqual(update.campos, { lancamento_id: null, confianca: "sem_par" });
    // total_pendentes conta só transações: a transação segue pendente, então não há update de totais
    assert.ok(!espiao.escritas.some((e) => e.tabela === "conciliacoes"));
  });

  it("500 sem alterar o par quando o insert do lançamento falha", async () => {
    queueConciliacaoValida();
    queueParValido();
    queue("pares_conciliacao", "single", { data: null, error: { message: "falha" } });

    const espiao = espionarEscritas();
    const res = criarResposta();
    await rejeitarPar(reqBase(), res);
    espiao.restaurar();

    assert.equal(res.statusCode, 500);
    assert.equal(espiao.escritas.filter((e) => e.metodo === "update").length, 0);
  });

  it("500 e remove o par do lançamento quando o update do par original falha", async () => {
    queueConciliacaoValida();
    queueParValido();
    queue("pares_conciliacao", "single", { data: { id: "novo-par" }, error: null });
    queue("pares_conciliacao", "await", { data: null, error: { message: "falha" } });

    const espiao = espionarEscritas();
    const res = criarResposta();
    await rejeitarPar(reqBase(), res);
    espiao.restaurar();

    assert.equal(res.statusCode, 500);
    assert.ok(espiao.escritas.some((e) => e.tabela === "pares_conciliacao" && e.metodo === "delete"));
    assert.ok(!espiao.escritas.some((e) => e.tabela === "conciliacoes"));
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

// ---------------------------------------------------------------------------
// Problemas já achados (catálogo do TEST-7, vault: referencias/catalogo-problemas-viram-teste-2026-10)
// ---------------------------------------------------------------------------

describe("Pares e conclusão — problemas já achados", () => {
  // PRB-C-18 (#327): rejeitarPar não olhava confirmado_em e "desconfirmava" um
  // provável já confirmado, voltando a transação para pendente.
  it("rejeitar: 409 quando o par já foi confirmado, sem escrever nada (PRB-C-18)", async () => {
    queueConciliacaoValida();
    queueParValido({ confirmado_em: "2026-08-01T00:00:00.000Z" });

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

// Banco em memória com estado, só para os casos de concorrência: cada consulta
// cede a vez (setImmediate) como uma ida ao banco de verdade, então dois pedidos
// em Promise.all intercalam leitura e escrita. Filtros de update (.eq/.is/.in)
// valem de verdade: um UPDATE condicional (ex.: .is("confirmado_em", null))
// só atinge as linhas que ainda casam. Não cobre supabase.rpc — se a correção do
// #690 for uma função no banco, estes casos migram para o teste com banco real (TEST-9).
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

describe("Pares em paralelo (#690)", () => {
  const PAR_2 = "cccccccc-cccc-cccc-cccc-ccccccccccc2";
  const PAR_3 = "cccccccc-cccc-cccc-cccc-ccccccccccc3";
  let tabelas;
  let originalFromLocal;

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
    supabase.from = bancoEmMemoria(tabelas);
  });

  const restaurar = () => { supabase.from = originalFromLocal; };
  const chamar = async (acao, pareId = PAR_ID) => {
    const res = criarResposta();
    await acao(reqBase({ params: { id: CONCILIACAO_ID, pareId } }), res);
    return res.statusCode;
  };
  const conciliacao = () => tabelas.conciliacoes[0];
  const paresDoLancamento = (lancamentoId) =>
    tabelas.pares_conciliacao.filter((p) => p.lancamento_id === lancamentoId);

  // Prova que o banco em memória reproduz o comportamento sequencial que já
  // funciona — senão os casos em skip abaixo não provariam nada.
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

  // BUG (#690): leitura de confirmado_em e UPDATE sem guarda de estado — os
  // dois pedidos leem "pendente" e os dois gravam.
  it.skip("confirmar + rejeitar o mesmo par em paralelo: um 200 e um 409 (PRB-C-13, #690)", async () => {
    try {
      const status = await Promise.all([chamar(confirmarPar), chamar(rejeitarPar)]);
      assert.deepEqual(status.sort(), [200, 409]);
      const par = tabelas.pares_conciliacao.find((p) => p.id === PAR_ID);
      const confirmado = par.confianca === "provavel" && par.confirmado_em !== null;
      const rejeitado = par.confianca === "sem_par" && par.lancamento_id === null;
      assert.ok(confirmado !== rejeitado, "o par termina num único estado");
    } finally {
      restaurar();
    }
  });

  // BUG (#690)
  it.skip("3× confirmar o mesmo par em paralelo: um 200 e dois 409, totais 1/2 (PRB-C-13, #690)", async () => {
    try {
      const status = await Promise.all([chamar(confirmarPar), chamar(confirmarPar), chamar(confirmarPar)]);
      assert.deepEqual(status.sort(), [200, 409, 409]);
      assert.equal(conciliacao().total_conciliadas, 1);
      assert.equal(conciliacao().total_pendentes, 2);
    } finally {
      restaurar();
    }
  });

  // BUG (#690): rejeitar em duas abas insere dois pares sem_par para o mesmo lançamento.
  it.skip("rejeitar o mesmo par em duas abas: um 200, um 409 e um só par do lançamento (PRB-C-14, #690)", async () => {
    try {
      const status = await Promise.all([chamar(rejeitarPar), chamar(rejeitarPar)]);
      assert.deepEqual(status.sort(), [200, 409]);
      assert.equal(paresDoLancamento("l0").length, 1);
    } finally {
      restaurar();
    }
  });

  // BUG (#690): os totais são lidos e depois gravados (+1/−1), sem operação
  // atômica; confirmações paralelas de pares diferentes perdem incrementos.
  it.skip("confirmar 3 pares diferentes em paralelo: totais 3/0 (PRB-C-15, #690)", async () => {
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
