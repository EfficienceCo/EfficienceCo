import { describe, it, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import supabase from "../src/config/database.js";
import { PERFIS } from "../src/config/perfis.js";
import { gerarRelatorioConciliacao } from "../src/controllers/conciliacoes.controller.js";
import PDFDocument from "pdfkit";
import {
  formatarMoeda,
  montarConteudoRelatorio,
  gerarRelatorioConciliacaoPDF,
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
    order() { return builder; },
    range() { return builder; },
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

async function cabecalhoDoPdf(banco, conta = "7654") {
  const chamadas = [];
  const textOriginal = PDFDocument.prototype.text;
  PDFDocument.prototype.text = function (texto, x, y, opcoes) {
    if (typeof y === "number") chamadas.push(String(texto));
    return textOriginal.call(this, texto, x, y, opcoes);
  };
  try {
    await gerarRelatorioConciliacaoPDF({
      cliente: "Padaria Central",
      banco,
      conta,
      mes: 6,
      ano: 2024,
      geradoEm: new Date(2024, 5, 30, 10, 0),
      totais: {
        totalTransacoes: 0,
        totalConciliadas: 0,
        totalTransacoesPendentes: 0,
        totalLancamentosSemPar: 0,
        valorTotalConciliado: 0,
      },
      matches: [],
      semPar: [],
    });
  } finally {
    PDFDocument.prototype.text = textOriginal;
  }
  return chamadas.find((texto) => texto.startsWith("Banco:"));
}

describe("gerarRelatorioConciliacaoPDF — banco e conta", () => {
  // PRB-C-35 / BUG-CONC-23 (#700). O PDF recebe o BANKID gravado e mostra o nome.
  it("cabeçalho mostra o nome do banco quando o código é conhecido (0237 → Bradesco) (PRB-C-35, #700)", async () => {
    const cabecalho = await cabecalhoDoPdf("0237");
    assert.match(cabecalho, /Bradesco/i);
    assert.match(cabecalho, /7654/);
  });

  it("cabeçalho mantém o código desconhecido e o nome que já veio gravado", async () => {
    assert.match(await cabecalhoDoPdf("999"), /Banco: 999 /);
    assert.match(await cabecalhoDoPdf("Itaú", "1234"), /Banco: Itaú /);
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

// ---------------------------------------------------------------------------
// Posição das linhas da tabela (#699): descrição longa quebra em mais linhas e a
// linha seguinte não pode ser desenhada por cima da continuação.
// ---------------------------------------------------------------------------

describe("gerarRelatorioConciliacaoPDF: linhas de altura variável (#699)", () => {
  const TOTAIS = {
    totalTransacoes: 0, totalConciliadas: 0, totalTransacoesPendentes: 0,
    totalLancamentosSemPar: 0, valorTotalConciliado: 0,
  };
  const LARGURA_UTIL = 595.28 - 100; // A4 com margem 50
  const LARGURA_TEXTO_BANCO = LARGURA_UTIL * 0.34 - 6;

  // Registra cada texto desenhado (texto, y, página) sem alterar o PDF gerado.
  function gerarEspiando(matches) {
    const desenhos = [];
    let pagina = 0;
    const textOriginal = PDFDocument.prototype.text;
    const addPageOriginal = PDFDocument.prototype.addPage;
    PDFDocument.prototype.text = function (texto, x, y, opcoes) {
      if (typeof y === "number") desenhos.push({ texto: String(texto), y, pagina });
      return textOriginal.call(this, texto, x, y, opcoes);
    };
    PDFDocument.prototype.addPage = function (...args) {
      pagina += 1;
      return addPageOriginal.apply(this, args);
    };
    return gerarRelatorioConciliacaoPDF({
      cliente: "Cliente", banco: "0341", conta: "7890", mes: 8, ano: 2026, geradoEm: new Date(),
      totais: TOTAIS, matches, semPar: [],
    }).finally(() => {
      PDFDocument.prototype.text = textOriginal;
      PDFDocument.prototype.addPage = addPageOriginal;
    }).then(() => desenhos);
  }

  function match(i, descricaoBanco, descricaoLancamento = "Lançamento") {
    return { data: `2026-08-${String((i % 28) + 1).padStart(2, "0")}`, descricaoBanco, descricaoLancamento, valor: 10 };
  }

  // Altura que o texto ocupa na coluna "descrição banco", medida pelo próprio pdfkit.
  function alturaMedida(texto) {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    doc.font("Helvetica").fontSize(8);
    return doc.heightOfString(texto, { width: LARGURA_TEXTO_BANCO });
  }

  for (const tamanho of [60, 200]) {
    it(`descrição de ${tamanho} caracteres não sobrepõe a linha seguinte`, async () => {
      const longa = ("RECEBIMENTO PIX ".repeat(20)).slice(0, tamanho).trim();
      const desenhos = await gerarEspiando([match(0, longa), match(1, "CURTA")]);

      const yLonga = desenhos.find((d) => d.texto === longa).y;
      const yProxima = desenhos.find((d) => d.texto === "CURTA").y;

      assert.ok(alturaMedida(longa) > alturaMedida("CURTA"), "a descrição precisa quebrar em mais de uma linha");
      // a linha seguinte começa depois de todo o texto da anterior
      assert.ok(yProxima >= yLonga + alturaMedida(longa), `próxima linha em ${yProxima}, texto vai até ${yLonga + alturaMedida(longa)}`);
    });
  }

  it("linha de uma linha só mantém a altura de antes (14 pt)", async () => {
    const desenhos = await gerarEspiando([match(0, "CURTA A"), match(1, "CURTA B")]);
    const y = (t) => desenhos.find((d) => d.texto === t).y;
    assert.equal(y("CURTA B") - y("CURTA A"), 14);
  });

  it("paginação: nenhuma linha passa do limite inferior com alturas variáveis", async () => {
    const longa = "DESCRICAO MUITO LONGA DE BANCO ".repeat(8).trim(); // ~250 caracteres
    const matches = Array.from({ length: 60 }, (_, i) => match(i, i % 3 === 0 ? longa : `CURTA ${i}`));
    const desenhos = await gerarEspiando(matches);

    const limiteInferior = 841.89 - 50;
    const linhas = desenhos.filter((d) => d.texto === longa || /^CURTA \d+$/.test(d.texto));
    assert.equal(linhas.length, 60);
    assert.ok(Math.max(...linhas.map((l) => l.pagina)) >= 1, "o relatório precisa passar de uma página");
    for (const l of linhas) {
      assert.ok(l.y + alturaMedida(l.texto) <= limiteInferior, `linha "${l.texto.slice(0, 20)}" termina em ${l.y + alturaMedida(l.texto)}`);
    }
  });

  it("descrição enorme ocupa no máximo 120 pt e a linha seguinte continua na mesma página", async () => {
    const gigante = "PALAVRA ".repeat(400).trim();
    const desenhos = await gerarEspiando([match(0, gigante), match(1, "DEPOIS")]);
    const yGigante = desenhos.find((d) => d.texto === gigante).y;
    const depois = desenhos.find((d) => d.texto === "DEPOIS");
    assert.equal(depois.y - yGigante, 120);
    assert.equal(depois.pagina, desenhos.find((d) => d.texto === gigante).pagina);
  });

  it("descrição de 199 caracteres com muitas quebras de linha mantém todas as colunas da linha na mesma página", async () => {
    const comQuebras = "x\n".repeat(99) + "x"; // 199 caracteres, ~100 linhas se as quebras forem respeitadas
    assert.equal(comQuebras.length, 199);
    const desenhos = await gerarEspiando([match(0, "ANTES"), match(1, comQuebras, "LANC-QUEBRAS"), match(2, "DEPOIS")]);

    // "Lançamento" é a outra coluna de texto da mesma linha; os dois têm de cair na mesma página
    const linha = desenhos.filter((d) => d.texto === "LANC-QUEBRAS" || d.texto.startsWith("x"));
    assert.equal(linha.length, 2);
    assert.equal(new Set(linha.map((d) => d.pagina)).size, 1, `páginas: ${linha.map((d) => d.pagina)}`);
  });
});
