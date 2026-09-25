import PDFDocument from "pdfkit";

// Mesmo formato da UI (Intl pt-BR/BRL): "R$ 6.562,01". O Intl separa "R$" do número
// com NBSP; troca por espaço comum para o texto extraído do PDF bater com a tela.
const FORMATADOR_MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatarMoeda(valor) {
  return FORMATADOR_MOEDA.format(Number(valor ?? 0)).replace(/\s/g, " ");
}

function formatarData(dataIso) {
  if (!dataIso) return "-";
  const [ano, mes, dia] = String(dataIso).slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

function formatarDataHora(data) {
  const dia = String(data.getDate()).padStart(2, "0");
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const ano = data.getFullYear();
  const hora = String(data.getHours()).padStart(2, "0");
  const minuto = String(data.getMinutes()).padStart(2, "0");
  return `${dia}/${mes}/${ano} ${hora}:${minuto}`;
}

function documentoParaBuffer(montarConteudo) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    montarConteudo(doc);
    doc.end();
  });
}

// Mesmo vocabulário visual dos relatórios de folha (folha.service.js): caixa com
// borda, grid de células com rótulo pequeno em cima, header de tabela em negrito.
function desenharCelula(doc, x, y, largura, altura, texto, opcoes = {}) {
  const { rotulo, alinhamento = "left", negrito = false, tamanho = 8 } = opcoes;
  const padding = 3;
  doc.lineWidth(0.5).rect(x, y, largura, altura).stroke();
  if (rotulo) {
    doc.font("Helvetica").fontSize(6).fillColor("black")
      .text(rotulo, x + padding, y + 2, { width: largura - padding * 2 });
    doc.font(negrito ? "Helvetica-Bold" : "Helvetica").fontSize(tamanho).fillColor("black")
      .text(texto, x + padding, y + 11, { width: largura - padding * 2, align: alinhamento });
  } else {
    const offsetY = (altura - tamanho) / 2;
    doc.font(negrito ? "Helvetica-Bold" : "Helvetica").fontSize(tamanho).fillColor("black")
      .text(texto, x + padding, y + offsetY, { width: largura - padding * 2, align: alinhamento });
  }
}

function desenharLinhaCelulas(doc, x, y, altura, colunas) {
  let cursorX = x;
  colunas.forEach((coluna) => {
    desenharCelula(doc, cursorX, y, coluna.largura, altura, coluna.texto, coluna);
    cursorX += coluna.largura;
  });
}

function desenharHeaderTabela(doc, x, y, colunas) {
  let cursorX = x;
  colunas.forEach((coluna) => {
    doc.font("Helvetica-Bold").fontSize(7).fillColor("black")
      .text(coluna.rotulo, cursorX + 3, y + 5, { width: coluna.largura - 6, align: coluna.alinhamento || "left" });
    cursorX += coluna.largura;
  });
}

function desenharLinhaTabela(doc, x, y, colunas, linha) {
  let cursorX = x;
  colunas.forEach((coluna) => {
    doc.font("Helvetica").fontSize(8).fillColor("black")
      .text(linha[coluna.chave] ?? "", cursorX + 3, y + 3, { width: coluna.largura - 6, align: coluna.alinhamento || "left" });
    cursorX += coluna.largura;
  });
}

function fecharSegmentoTabela(doc, x, yTopo, yFim, colunas) {
  const larguraTotal = colunas.reduce((soma, coluna) => soma + coluna.largura, 0);
  doc.lineWidth(0.5).rect(x, yTopo, larguraTotal, yFim - yTopo).stroke();
  let cursorX = x;
  for (let i = 0; i < colunas.length - 1; i++) {
    cursorX += colunas[i].largura;
    doc.moveTo(cursorX, yTopo).lineTo(cursorX, yFim).stroke();
  }
}

// Título de seção + tabela com paginação própria (quebra de página redesenha o
// header da tabela no topo da nova página). Usado 2x (matches e itens sem par)
// com o mesmo mecanismo, só mudando colunas/linhas.
function desenharTabela(doc, { x0, larguraUtil, limiteInferior }, y, titulo, colunas, linhas) {
  doc.font("Helvetica-Bold").fontSize(10).fillColor("black").text(titulo, x0, y, { width: larguraUtil });
  y += 16;

  const alturaHeader = 16;
  const alturaLinha = 14;

  let yTopo = y;
  desenharHeaderTabela(doc, x0, y, colunas);
  y += alturaHeader;

  linhas.forEach((linha) => {
    if (y + alturaLinha > limiteInferior) {
      fecharSegmentoTabela(doc, x0, yTopo, y, colunas);
      doc.addPage();
      y = doc.page.margins.top;
      yTopo = y;
      desenharHeaderTabela(doc, x0, y, colunas);
      y += alturaHeader;
    }
    desenharLinhaTabela(doc, x0, y, colunas, linha);
    y += alturaLinha;
  });
  fecharSegmentoTabela(doc, x0, yTopo, y, colunas);

  return y + 14;
}

const COLUNAS_MATCHES = (larguraUtil) => [
  { chave: "data", largura: larguraUtil * 0.12, rotulo: "DATA" },
  { chave: "descricao_banco", largura: larguraUtil * 0.34, rotulo: "DESCRIÇÃO BANCO" },
  { chave: "descricao_lancamento", largura: larguraUtil * 0.34, rotulo: "DESCRIÇÃO LANÇAMENTO" },
  { chave: "valor", largura: larguraUtil * 0.2, rotulo: "VALOR", alinhamento: "right" },
];

const COLUNAS_SEM_PAR = (larguraUtil) => [
  { chave: "data", largura: larguraUtil * 0.12, rotulo: "DATA" },
  { chave: "descricao", largura: larguraUtil * 0.46, rotulo: "DESCRIÇÃO" },
  { chave: "valor", largura: larguraUtil * 0.2, rotulo: "VALOR", alinhamento: "right" },
  { chave: "origem", largura: larguraUtil * 0.22, rotulo: "ORIGEM" },
];

// Par "conciliado" = automático ou provável já confirmado — mesmo critério usado em
// concluirConciliacao (conciliacoes.controller) para marcar conciliado=true. Como o
// relatório só existe para sessões com status='concluida', todo par 'provavel' aqui já
// tem confirmado_em setado (concluirConciliacao bloqueia com 409 se restar algum pendente).
function parConciliado(par) {
  return par.confianca === "automatico" || (par.confianca === "provavel" && par.confirmado_em);
}

// Monta as linhas das duas seções do relatório e os totais a partir dos pares da sessão.
export function montarConteudoRelatorio(paresTodos, transacoesPorId, lancamentosPorId) {
  const matches = [];
  const semPar = [];
  let valorTotalConciliado = 0;
  for (const par of paresTodos) {
    const transacao = par.transacao_id ? transacoesPorId[par.transacao_id] ?? null : null;
    const lancamento = par.lancamento_id ? lancamentosPorId[par.lancamento_id] ?? null : null;
    const valor = transacao?.valor ?? lancamento?.valor ?? 0;

    if (parConciliado(par)) {
      matches.push({
        data: transacao?.data_lancamento ?? lancamento?.data_lancamento ?? null,
        descricaoBanco: transacao?.descricao ?? null,
        descricaoLancamento: lancamento?.descricao ?? null,
        valor,
      });
      valorTotalConciliado += Number(valor);
    } else {
      semPar.push({
        data: (transacao ?? lancamento)?.data_lancamento ?? null,
        descricao: (transacao ?? lancamento)?.descricao ?? null,
        valor,
        origem: transacao ? "banco" : "lancamento_interno",
      });
    }
  }

  // Ordem cronológica em ambas as seções (data ISO compara como string; sem data
  // vai pro fim). Em "sem par" as duas origens ficam intercaladas por data.
  const porData = (a, b) => {
    if (a.data === b.data) return 0;
    if (!a.data) return 1;
    if (!b.data) return -1;
    return String(a.data).localeCompare(String(b.data));
  };
  matches.sort(porData);
  semPar.sort(porData);

  // Totais derivados dos pares (e não de conciliacao.total_pendentes): sessões antigas
  // gravaram "pendentes" somando transações e lançamentos sem par, o que não fecha
  // com total_transacoes. Aqui cada transação cai em exatamente um par.
  const transacoesPendentes = semPar.filter((item) => item.origem === "banco").length;
  const totais = {
    totalTransacoes: matches.length + transacoesPendentes,
    totalConciliadas: matches.length,
    totalTransacoesPendentes: transacoesPendentes,
    totalLancamentosSemPar: semPar.length - transacoesPendentes,
    valorTotalConciliado,
  };

  return { matches, semPar, totais };
}

// Relatório final de uma conciliação concluída — cabeçalho com cliente/banco/período,
// resumo com os totais derivados dos pares, e as duas tabelas exigidas pelo critério
// de aceite (matches confirmados, itens sem par), já em ordem cronológica.
export function gerarRelatorioConciliacaoPDF({ cliente, banco, conta, mes, ano, geradoEm, totais, matches, semPar }) {
  return documentoParaBuffer((doc) => {
    const x0 = doc.page.margins.left;
    const larguraUtil = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const limiteInferior = doc.page.height - doc.page.margins.bottom;
    let y = doc.page.margins.top;

    doc.font("Helvetica-Bold").fontSize(12).fillColor("black")
      .text("RELATÓRIO DE CONCILIAÇÃO BANCÁRIA", x0, y + 6, { width: larguraUtil, align: "center" });
    y += 26;
    doc.lineWidth(0.5).moveTo(x0, y).lineTo(x0 + larguraUtil, y).stroke();

    doc.font("Helvetica-Bold").fontSize(11).fillColor("black")
      .text(cliente, x0 + 6, y + 8, { width: larguraUtil * 0.55 });
    doc.font("Helvetica").fontSize(8)
      .text(`Gerado em ${formatarDataHora(geradoEm)}`, x0 + larguraUtil * 0.55, y + 10, {
        width: larguraUtil * 0.45 - 6,
        align: "right",
      });
    y += 24;

    doc.font("Helvetica").fontSize(9)
      .text(`Banco: ${banco || "-"}   Conta: ${conta || "-"}   Período: ${String(mes).padStart(2, "0")}/${ano}`, x0 + 6, y);
    y += 20;
    doc.lineWidth(0.5).moveTo(x0, y).lineTo(x0 + larguraUtil, y).stroke();

    const alturaTotais = 26;
    const larguraCelulaTotal = larguraUtil / 5;
    // Conciliadas + transações pendentes = total de transações; lançamentos internos
    // sem transação são contados à parte (não são "transações pendentes").
    desenharLinhaCelulas(doc, x0, y, alturaTotais, [
      { largura: larguraCelulaTotal, rotulo: "TOTAL TRANSAÇÕES", texto: String(totais.totalTransacoes), alinhamento: "right" },
      { largura: larguraCelulaTotal, rotulo: "CONCILIADAS", texto: String(totais.totalConciliadas), alinhamento: "right" },
      { largura: larguraCelulaTotal, rotulo: "TRANSAÇÕES PENDENTES", texto: String(totais.totalTransacoesPendentes), alinhamento: "right" },
      { largura: larguraCelulaTotal, rotulo: "LANÇAMENTOS SEM PAR", texto: String(totais.totalLancamentosSemPar), alinhamento: "right" },
      {
        largura: larguraCelulaTotal,
        rotulo: "VALOR TOTAL CONCILIADO",
        texto: formatarMoeda(totais.valorTotalConciliado),
        alinhamento: "right",
        negrito: true,
      },
    ]);
    y += alturaTotais + 14;

    const ctx = { x0, larguraUtil, limiteInferior };

    y = desenharTabela(
      doc,
      ctx,
      y,
      "MATCHES CONFIRMADOS",
      COLUNAS_MATCHES(larguraUtil),
      matches.map((m) => ({
        data: formatarData(m.data),
        descricao_banco: m.descricaoBanco || "-",
        descricao_lancamento: m.descricaoLancamento || "-",
        valor: formatarMoeda(m.valor),
      })),
    );

    if (y + 30 > limiteInferior) {
      doc.addPage();
      y = doc.page.margins.top;
    }

    desenharTabela(
      doc,
      ctx,
      y,
      "ITENS SEM PAR",
      COLUNAS_SEM_PAR(larguraUtil),
      semPar.map((item) => ({
        data: formatarData(item.data),
        descricao: item.descricao || "-",
        valor: formatarMoeda(item.valor),
        origem: item.origem === "banco" ? "Banco" : "Lançamento interno",
      })),
    );
  });
}
