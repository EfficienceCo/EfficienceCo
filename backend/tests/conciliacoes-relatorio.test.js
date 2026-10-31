import { describe, it, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import supabase from "../src/config/database.js";
import { PERFIS } from "../src/config/perfis.js";
import { gerarRelatorioConciliacao } from "../src/controllers/conciliacoes.controller.js";
import PDFDocument from "pdfkit";
import {
  formatarMoeda,
  gerarRelatorioConciliacaoPDF,
  montarConteudoRelatorio,
} from "../src/services/conciliacao-relatorio.service.js";

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

  it("valorTotalConciliado soma em centavos, sem erro de ponto flutuante (0,1 + 0,2)", () => {
    const paresFloat = [
      { transacao_id: "a", lancamento_id: "x", confianca: "automatico", confirmado_em: null },
      { transacao_id: "b", lancamento_id: "y", confianca: "automatico", confirmado_em: null },
    ];
    const { totais } = montarConteudoRelatorio(
      paresFloat,
      { a: { id: "a", valor: 0.1, data_lancamento: "2026-07-01" }, b: { id: "b", valor: 0.2, data_lancamento: "2026-07-02" } },
      { x: { id: "x", valor: 0.1 }, y: { id: "y", valor: 0.2 } },
    );
    assert.equal(totais.valorTotalConciliado, 0.3);
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

// ---------------------------------------------------------------------------
// Problemas já achados (catálogo do TEST-7, vault: referencias/catalogo-problemas-viram-teste-2026-10)
// ---------------------------------------------------------------------------

// Grava cada doc.text(texto, x, y, opções) com a altura que o texto ocupa na
// largura da célula, para conferir o desenho sem abrir o PDF.
async function desenharRelatorio(dados) {
  const chamadas = [];
  const textOriginal = PDFDocument.prototype.text;
  PDFDocument.prototype.text = function (texto, x, y, opcoes) {
    if (typeof y === "number") {
      const altura = this.heightOfString(String(texto), { width: opcoes?.width });
      chamadas.push({ texto: String(texto), x, y, altura, pagina: this.page });
    }
    return textOriginal.call(this, texto, x, y, opcoes);
  };
  try {
    await gerarRelatorioConciliacaoPDF({
      cliente: "Padaria Central",
      banco: "0237",
      conta: "7654",
      mes: 7,
      ano: 2026,
      geradoEm: new Date(2026, 6, 31, 10, 0),
      totais: { totalTransacoes: 0, totalConciliadas: 0, totalTransacoesPendentes: 0, totalLancamentosSemPar: 0, valorTotalConciliado: 0 },
      matches: [],
      semPar: [],
      ...dados,
    });
  } finally {
    PDFDocument.prototype.text = textOriginal;
  }
  return chamadas;
}

describe("gerarRelatorioConciliacaoPDF — problemas já achados", () => {
  // BUG (#699): a linha da tabela tem altura fixa (14 pt); descrição longa quebra
  // em várias linhas e invade a linha seguinte.
  it.skip("descrição de 60 e de 200 caracteres não invade a linha seguinte (PRB-C-32, #699)", async () => {
    const descricao = (n) => "PAGAMENTO FORNECEDOR ".repeat(20).slice(0, n);
    const matches = [
      { data: "2026-07-01", descricaoBanco: descricao(200), descricaoLancamento: "curta", valor: 10 },
      { data: "2026-07-02", descricaoBanco: descricao(60), descricaoLancamento: "curta", valor: 20 },
      { data: "2026-07-03", descricaoBanco: "curta", descricaoLancamento: "curta", valor: 30 },
    ];

    const chamadas = await desenharRelatorio({ matches });

    for (let i = 0; i < 2; i += 1) {
      const celula = chamadas.find((c) => c.texto === matches[i].descricaoBanco);
      const proximaLinha = chamadas.find((c) => c.texto === `0${i + 2}/07/2026`);
      assert.ok(celula && proximaLinha, "linhas da tabela não encontradas");
      if (proximaLinha.pagina !== celula.pagina) continue;
      assert.ok(
        proximaLinha.y >= celula.y + celula.altura,
        `linha ${i + 2} em y=${proximaLinha.y}, mas a descrição da linha ${i + 1} vai até y=${celula.y + celula.altura}`,
      );
    }
  });

  // BUG (#700): o cabeçalho mostra o código do banco (0237) em vez do nome.
  it.skip("cabeçalho mostra o nome do banco quando o código é conhecido (0237 → Bradesco) (PRB-C-35, #700)", async () => {
    const chamadas = await desenharRelatorio({});
    const cabecalho = chamadas.find((c) => c.texto.startsWith("Banco:"));
    assert.match(cabecalho.texto, /Bradesco/i);
  });
});

// ---------------------------------------------------------------------------
// TEST-8 (#685): bordas de moeda e de totais do relatório. O dataset completo do
// QA-C (10 / 5 / 5 / 4 / R$ 4.489,55) está em conciliacao-dataset-qac.test.js.
// ---------------------------------------------------------------------------

describe("relatório — bordas de moeda e totais (TEST-8)", () => {
  it("formatarMoeda: centavos, milhar e milhão no padrão pt-BR (R$ 4.489,55 do QA-C 2026-10-12)", () => {
    assert.equal(formatarMoeda(4489.55), "R$ 4.489,55"); // total do PDF conferido à mão no QA-C 10-12
    assert.equal(formatarMoeda(0.01), "R$ 0,01");
    assert.equal(formatarMoeda(1000), "R$ 1.000,00"); // QA-C 09-20 #9: PDF mostrava 1000 sem R$ nem milhar
    assert.equal(formatarMoeda(1234567.8), "R$ 1.234.567,80");
    assert.equal(formatarMoeda(0), "R$ 0,00");
  });

  it("soma em centavos inteiros: 1,15 + 4,35 + 8,20 = 13,70 (em float cru dá 13.699999999999998)", () => {
    // Conta feita à mão: 1,15 + 4,35 = 5,50; + 8,20 = 13,70. 1.15*100, 4.35*100 e 8.2*100 não são
    // inteiros em ponto flutuante, então somar sem arredondar cada parcela erra o último dígito.
    const valores = { a: 1.15, b: 4.35, c: 8.2 };
    const pares = Object.keys(valores).map((id) => (
      { transacao_id: id, lancamento_id: null, confianca: "automatico", confirmado_em: null }));
    const transacoes = Object.fromEntries(Object.entries(valores).map(
      ([id, valor]) => [id, { id, valor, data_lancamento: "2024-06-01" }]));
    const { totais } = montarConteudoRelatorio(pares, transacoes, {});
    assert.equal(totais.valorTotalConciliado, 13.7);
  });

  it("par provável SEM confirmação não conta como conciliado (vai para 'sem par' do relatório)", () => {
    // Regra do serviço (parConciliado): automático ou provável confirmado. Um provável pendente
    // no PDF é pendência de transação, não conciliada.
    const { totais, matches } = montarConteudoRelatorio(
      [{ transacao_id: "a", lancamento_id: "x", confianca: "provavel", confirmado_em: null }],
      { a: { id: "a", valor: 10, data_lancamento: "2024-06-18", descricao: "A" } },
      { x: { id: "x", valor: 10, data_lancamento: "2024-06-16", descricao: "X" } },
    );
    assert.equal(matches.length, 0);
    assert.equal(totais.totalConciliadas, 0);
    assert.equal(totais.valorTotalConciliado, 0);
  });

  it("o total de transações é derivado dos pares, e não de total_pendentes gravado na sessão", () => {
    // PRB-C-30 (#559): sessões antigas gravaram 'pendentes' somando transações e lançamentos.
    // Aqui são 1 conciliada + 1 transação pendente + 2 lançamentos sem par = 2 transações.
    const { totais } = montarConteudoRelatorio(
      [
        { transacao_id: "a", lancamento_id: "x", confianca: "automatico", confirmado_em: null },
        { transacao_id: "b", lancamento_id: null, confianca: "sem_par", confirmado_em: null },
        { transacao_id: null, lancamento_id: "y", confianca: "sem_par", confirmado_em: null },
        { transacao_id: null, lancamento_id: "z", confianca: "sem_par", confirmado_em: null },
      ],
      { a: { id: "a", valor: 1, data_lancamento: "2024-06-01" }, b: { id: "b", valor: 2, data_lancamento: "2024-06-02" } },
      { x: { id: "x", valor: 1 }, y: { id: "y", valor: 3, data_lancamento: "2024-06-03" }, z: { id: "z", valor: 4, data_lancamento: "2024-06-04" } },
    );
    assert.equal(totais.totalTransacoes, 2);
    assert.equal(totais.totalTransacoesPendentes, 1);
    assert.equal(totais.totalLancamentosSemPar, 2);
  });
});
