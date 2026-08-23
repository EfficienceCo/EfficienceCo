import PDFDocument from "pdfkit";

function formatarMoeda(valor) {
  return Number(valor ?? 0).toFixed(2).replace(".", ",");
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

// Relatório final de uma conciliação concluída — cabeçalho com cliente/banco/período,
// resumo com os totais já persistidos na sessão, e as duas tabelas exigidas pelo
// critério de aceite (matches confirmados, itens sem par).
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
    const larguraCelulaTotal = larguraUtil / 4;
    desenharLinhaCelulas(doc, x0, y, alturaTotais, [
      { largura: larguraCelulaTotal, rotulo: "TOTAL TRANSAÇÕES", texto: String(totais.totalTransacoes), alinhamento: "right" },
      { largura: larguraCelulaTotal, rotulo: "TOTAL CONCILIADAS", texto: String(totais.totalConciliadas), alinhamento: "right" },
      { largura: larguraCelulaTotal, rotulo: "TOTAL PENDENTES", texto: String(totais.totalPendentes), alinhamento: "right" },
      {
        largura: larguraCelulaTotal,
        rotulo: "VALOR TOTAL CONCILIADO",
        texto: `R$ ${formatarMoeda(totais.valorTotalConciliado)}`,
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
