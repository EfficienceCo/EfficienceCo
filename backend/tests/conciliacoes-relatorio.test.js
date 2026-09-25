import { describe, it, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import supabase from "../src/config/database.js";
import { PERFIS } from "../src/config/perfis.js";
import { gerarRelatorioConciliacao } from "../src/controllers/conciliacoes.controller.js";
import { formatarMoeda, montarConteudoRelatorio } from "../src/services/conciliacao-relatorio.service.js";

const CLIENTE_A = "11111111-1111-1111-1111-111111111111";
const CLIENTE_B = "22222222-2222-2222-2222-222222222222";
const CONCILIACAO_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const EXTRATO_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
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
    eq() { return builder; },
    in() { return builder; },
    maybeSingle() { return Promise.resolve(consumir("maybeSingle", { data: null, error: null })); },
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
    headers: {},
    status(codigo) { this.statusCode = codigo; return this; },
    json(payload) { this.body = payload; return this; },
    send(payload) { this.body = payload; return this; },
    setHeader(chaveHeader, valor) { this.headers[chaveHeader] = valor; },
  };
}

function reqBase(overrides = {}) {
  return {
    usuario: { id: USUARIO_ID, perfil: PERFIS.ADMIN_CLIENTE, cliente_id: CLIENTE_A },
    params: { id: CONCILIACAO_ID },
    body: {},
    query: {},
    ...overrides,
  };
}

function queueConciliacaoConcluida(overrides = {}) {
  queue("conciliacoes", "maybeSingle", {
    data: {
      id: CONCILIACAO_ID,
      cliente_id: CLIENTE_A,
      extrato_id: EXTRATO_ID,
      mes: 8,
      ano: 2026,
      status: "concluida",
      total_transacoes: 3,
      total_conciliadas: 2,
      total_pendentes: 1,
      ...overrides,
    },
    error: null,
  });
}

function queueDependenciasBasicas() {
  queue("clientes", "maybeSingle", { data: { nome: "Cliente Teste Ltda" }, error: null });
  queue("extratos_bancarios", "maybeSingle", { data: { banco: "Itaú", conta: "1234" }, error: null });
}

// ---------------------------------------------------------------------------
// GET /conciliacoes/:id/relatorio
// ---------------------------------------------------------------------------

describe("GET /conciliacoes/:id/relatorio", () => {
  it("200: gera PDF com headers e nome de arquivo corretos", async () => {
    queueConciliacaoConcluida();
    queueDependenciasBasicas();
    queue("pares_conciliacao", "await", {
      data: [
        { id: "par-1", transacao_id: "t1", lancamento_id: "l1", confianca: "automatico", confirmado_em: null },
        { id: "par-2", transacao_id: "t2", lancamento_id: "l2", confianca: "provavel", confirmado_em: "2026-08-05T00:00:00.000Z" },
        { id: "par-3", transacao_id: "t3", lancamento_id: null, confianca: "sem_par", confirmado_em: null },
      ],
      error: null,
    });
    queue("transacoes_extrato", "await", {
      data: [
        { id: "t1", data_lancamento: "2026-08-01", descricao: "PIX recebido", valor: 100 },
        { id: "t2", data_lancamento: "2026-08-02", descricao: "TED enviada", valor: 50 },
        { id: "t3", data_lancamento: "2026-08-03", descricao: "Tarifa bancária", valor: 15 },
      ],
      error: null,
    });
    queue("lancamentos_contabeis", "await", {
      data: [
        { id: "l1", data_lancamento: "2026-08-01", descricao: "Recebimento cliente", valor: 100 },
        { id: "l2", data_lancamento: "2026-08-02", descricao: "Pagamento fornecedor", valor: 50 },
      ],
      error: null,
    });

    const res = criarResposta();
    await gerarRelatorioConciliacao(reqBase(), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["Content-Type"], "application/pdf");
    assert.equal(res.headers["Content-Disposition"], 'attachment; filename="conciliacao-2026-08-cliente_teste_ltda.pdf"');
    assert.ok(Buffer.isBuffer(res.body));
    assert.equal(res.body.subarray(0, 4).toString("ascii"), "%PDF");
  });

  it("200: sessão sem pares ainda gera PDF válido (seções vazias)", async () => {
    queueConciliacaoConcluida({ total_transacoes: 0, total_conciliadas: 0, total_pendentes: 0 });
    queueDependenciasBasicas();
    queue("pares_conciliacao", "await", { data: [], error: null });

    const res = criarResposta();
    await gerarRelatorioConciliacao(reqBase(), res);

    assert.equal(res.statusCode, 200);
    assert.ok(Buffer.isBuffer(res.body));
    assert.equal(res.body.subarray(0, 4).toString("ascii"), "%PDF");
  });

  it("400 quando cliente_id não pode ser resolvido", async () => {
    const res = criarResposta();
    await gerarRelatorioConciliacao(reqBase({ usuario: { perfil: PERFIS.ADMIN_EFFICIENCE } }), res);
    assert.equal(res.statusCode, 400);
  });

  it("404 quando a conciliação não existe", async () => {
    queue("conciliacoes", "maybeSingle", { data: null, error: null });
    const res = criarResposta();
    await gerarRelatorioConciliacao(reqBase(), res);
    assert.equal(res.statusCode, 404);
  });

  it("404 quando a conciliação pertence a outro cliente", async () => {
    queueConciliacaoConcluida({ cliente_id: CLIENTE_B });
    const res = criarResposta();
    await gerarRelatorioConciliacao(reqBase(), res);
    assert.equal(res.statusCode, 404);
  });

  it("409 quando a conciliação ainda está em andamento", async () => {
    queueConciliacaoConcluida({ status: "em_andamento" });
    const res = criarResposta();
    await gerarRelatorioConciliacao(reqBase(), res);
    assert.equal(res.statusCode, 409);
  });

  it("500 quando falha a busca do cliente", async () => {
    queueConciliacaoConcluida();
    queue("clientes", "maybeSingle", { data: null, error: { message: "falha" } });
    queue("extratos_bancarios", "maybeSingle", { data: { banco: "Itaú", conta: "1234" }, error: null });
    queue("pares_conciliacao", "await", { data: [], error: null });

    const res = criarResposta();
    await gerarRelatorioConciliacao(reqBase(), res);
    assert.equal(res.statusCode, 500);
  });

  it("500 quando falha a busca do extrato", async () => {
    queueConciliacaoConcluida();
    queue("clientes", "maybeSingle", { data: { nome: "Cliente Teste" }, error: null });
    queue("extratos_bancarios", "maybeSingle", { data: null, error: { message: "falha" } });
    queue("pares_conciliacao", "await", { data: [], error: null });

    const res = criarResposta();
    await gerarRelatorioConciliacao(reqBase(), res);
    assert.equal(res.statusCode, 500);
  });

  it("500 quando falha a busca dos pares", async () => {
    queueConciliacaoConcluida();
    queueDependenciasBasicas();
    queue("pares_conciliacao", "await", { data: null, error: { message: "falha" } });

    const res = criarResposta();
    await gerarRelatorioConciliacao(reqBase(), res);
    assert.equal(res.statusCode, 500);
  });

  it("500 quando falha a busca das transações", async () => {
    queueConciliacaoConcluida();
    queueDependenciasBasicas();
    queue("pares_conciliacao", "await", {
      data: [{ id: "par-1", transacao_id: "t1", lancamento_id: null, confianca: "sem_par", confirmado_em: null }],
      error: null,
    });
    queue("transacoes_extrato", "await", { data: null, error: { message: "falha" } });

    const res = criarResposta();
    await gerarRelatorioConciliacao(reqBase(), res);
    assert.equal(res.statusCode, 500);
  });

  it("500 quando falha a busca dos lançamentos", async () => {
    queueConciliacaoConcluida();
    queueDependenciasBasicas();
    queue("pares_conciliacao", "await", {
      data: [{ id: "par-1", transacao_id: null, lancamento_id: "l1", confianca: "sem_par", confirmado_em: null }],
      error: null,
    });
    queue("lancamentos_contabeis", "await", { data: null, error: { message: "falha" } });

    const res = criarResposta();
    await gerarRelatorioConciliacao(reqBase(), res);
    assert.equal(res.statusCode, 500);
  });
});

// ---------------------------------------------------------------------------
// Conteúdo do PDF (#559): moeda pt-BR, totais que fecham, ordem cronológica
// ---------------------------------------------------------------------------

describe("formatarMoeda (relatório de conciliação)", () => {
  it("usa o padrão pt-BR da UI: R$ + separador de milhar + vírgula decimal", () => {
    assert.equal(formatarMoeda(6562.01), "R$ 6.562,01");
    assert.equal(formatarMoeda("1638"), "R$ 1.638,00");
    assert.equal(formatarMoeda(38562), "R$ 38.562,00");
    assert.equal(formatarMoeda(null), "R$ 0,00");
  });

  it("separa R$ do número com espaço comum (não NBSP), para o texto extraído bater com a tela", () => {
    assert.equal(formatarMoeda(10).charCodeAt(2), 32); // 32 = espaço comum; o Intl devolve 160 (NBSP)
  });
});

describe("montarConteudoRelatorio", () => {
  const transacoesPorId = {
    t1: { id: "t1", data_lancamento: "2026-08-16", descricao: "PIX 16", valor: 100 },
    t2: { id: "t2", data_lancamento: "2026-08-13", descricao: "TED 13", valor: 6562.01 },
    t3: { id: "t3", data_lancamento: "2026-08-20", descricao: "Tarifa 20", valor: 15 },
    t4: { id: "t4", data_lancamento: "2026-08-05", descricao: "Débito 05", valor: 30 },
  };
  const lancamentosPorId = {
    l1: { id: "l1", data_lancamento: "2026-08-16", descricao: "Receb 16", valor: 100 },
    l2: { id: "l2", data_lancamento: "2026-08-14", descricao: "Pgto 14", valor: 6562.01 },
    l3: { id: "l3", data_lancamento: "2026-08-10", descricao: "Interno 10", valor: 1638 },
    l4: { id: "l4", data_lancamento: "2026-08-25", descricao: "Interno 25", valor: 40 },
  };
  const pares = [
    { transacao_id: "t1", lancamento_id: "l1", confianca: "automatico", confirmado_em: null },
    { transacao_id: "t2", lancamento_id: "l2", confianca: "provavel", confirmado_em: "2026-08-30T00:00:00.000Z" },
    // sem par agrupado por origem na entrada (como sai do matching): banco primeiro, depois internos
    { transacao_id: "t3", lancamento_id: null, confianca: "sem_par", confirmado_em: null },
    { transacao_id: "t4", lancamento_id: null, confianca: "sem_par", confirmado_em: null },
    { transacao_id: null, lancamento_id: "l3", confianca: "sem_par", confirmado_em: null },
    { transacao_id: null, lancamento_id: "l4", confianca: "sem_par", confirmado_em: null },
  ];

  it("totais: conciliadas + transações pendentes = total de transações; lançamentos sem par à parte", () => {
    const { totais } = montarConteudoRelatorio(pares, transacoesPorId, lancamentosPorId);
    assert.equal(totais.totalTransacoes, 4);
    assert.equal(totais.totalConciliadas, 2);
    assert.equal(totais.totalTransacoesPendentes, 2);
    assert.equal(totais.totalLancamentosSemPar, 2);
    assert.equal(totais.totalConciliadas + totais.totalTransacoesPendentes, totais.totalTransacoes);
    assert.equal(totais.valorTotalConciliado, 6662.01);
  });

  it("ordena matches e itens sem par por data (sem par intercala banco e lançamentos)", () => {
    const { matches, semPar } = montarConteudoRelatorio(pares, transacoesPorId, lancamentosPorId);
    assert.deepEqual(matches.map((m) => m.data), ["2026-08-13", "2026-08-16"]);
    assert.deepEqual(semPar.map((i) => i.data), ["2026-08-05", "2026-08-10", "2026-08-20", "2026-08-25"]);
    assert.deepEqual(semPar.map((i) => i.origem), ["banco", "lancamento_interno", "banco", "lancamento_interno"]);
  });

  it("itens sem data vão para o fim", () => {
    const { semPar } = montarConteudoRelatorio(
      [
        { transacao_id: "tx", lancamento_id: null, confianca: "sem_par", confirmado_em: null },
        { transacao_id: "t4", lancamento_id: null, confianca: "sem_par", confirmado_em: null },
      ],
      { ...transacoesPorId, tx: { id: "tx", data_lancamento: null, descricao: "Sem data", valor: 1 } },
      {},
    );
    assert.deepEqual(semPar.map((i) => i.descricao), ["Débito 05", "Sem data"]);
  });
});
