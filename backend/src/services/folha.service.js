import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

// Spec de colunas da planilha de folha de pagamento — contrato entre
// BK-FOLHA-TEMPLATE (gera) e BK-FOLHA-UPLOAD (valida). Ordem e nomes fixos.
export const COLUNAS_FOLHA = [
  { header: "empresa", key: "empresa", width: 25 },
  { header: "funcionario", key: "funcionario", width: 25 },
  { header: "cpf", key: "cpf", width: 16 },
  { header: "cargo", key: "cargo", width: 18 },
  { header: "salario_bruto", key: "salario_bruto", width: 15 },
  { header: "dias_trabalhados", key: "dias_trabalhados", width: 16 },
  { header: "horas_extras", key: "horas_extras", width: 14 },
  { header: "faltas", key: "faltas", width: 10 },
  { header: "adiantamento", key: "adiantamento", width: 14 },
  { header: "num_dependentes", key: "num_dependentes", width: 16 },
  { header: "vale_transporte", key: "vale_transporte", width: 16 },
];

const LINHAS_DE_DADOS = 500;

// Tabela progressiva de INSS vigente (2024, contribuinte empregado) — faixas marginais.
// Fonte: Portaria Interministerial MPS/MF. Teto de contribuição: R$ 908,85.
const FAIXAS_INSS = [
  { limite: 1412.00, aliquota: 0.075 },
  { limite: 2666.68, aliquota: 0.09 },
  { limite: 4000.03, aliquota: 0.12 },
  { limite: 7786.02, aliquota: 0.14 },
];
const TETO_INSS = 908.85;

// Tabela progressiva de IRRF vigente (2024, mensal) — alíquota + parcela a deduzir.
// Fonte: Instrução Normativa RFB, vigente desde fev/2024.
const FAIXAS_IR = [
  { limite: 2259.20, aliquota: 0, deducao: 0 },
  { limite: 2826.65, aliquota: 0.075, deducao: 169.44 },
  { limite: 3751.05, aliquota: 0.15, deducao: 381.44 },
  { limite: 4664.68, aliquota: 0.225, deducao: 662.77 },
  { limite: Infinity, aliquota: 0.275, deducao: 896.00 },
];
const DEDUCAO_POR_DEPENDENTE_IR = 189.59;

const ALIQUOTA_FGTS = 0.08;
const ALIQUOTA_DESCONTO_VT = 0.06;
const DIVISOR_HORA_EXTRA = 220;
const ADICIONAL_HORA_EXTRA = 1.5;

function arredondar(valor) {
  return Math.round(valor * 100) / 100;
}

// INSS é calculado por faixas marginais: cada pedaço da base paga a alíquota da sua
// própria faixa, não a alíquota da faixa final sobre o total. Acima do teto, contribuição
// é fixa (TETO_INSS), a base não é mais reduzida.
export function calcularINSS(baseCalculo) {
  if (baseCalculo <= 0) return 0;

  let inss = 0;
  let limiteAnterior = 0;

  for (const { limite, aliquota } of FAIXAS_INSS) {
    if (baseCalculo <= limiteAnterior) break;
    const valorNaFaixa = Math.min(baseCalculo, limite) - limiteAnterior;
    inss += valorNaFaixa * aliquota;
    limiteAnterior = limite;
  }

  if (baseCalculo > FAIXAS_INSS[FAIXAS_INSS.length - 1].limite) {
    inss = TETO_INSS;
  }

  return arredondar(inss);
}

// IRRF usa a tabela progressiva simplificada (alíquota da faixa em que a base cai,
// menos a parcela a deduzir da própria faixa) — não é cálculo marginal como o INSS.
export function calcularIR(baseCalculo) {
  if (baseCalculo <= 0) return 0;

  const faixa = FAIXAS_IR.find(({ limite }) => baseCalculo <= limite);
  const ir = baseCalculo * faixa.aliquota - faixa.deducao;

  return arredondar(Math.max(0, ir));
}

// Calcula todos os valores de folha de um funcionário a partir da linha lida da planilha.
// Fórmula do líquido: bruto − faltas + horas_extras − INSS − IR − adiantamento − desconto_vt.
export function calcularFolhaFuncionario(linha) {
  const salarioBruto = linha.salario_bruto;
  const valorHoraExtra = (salarioBruto / DIVISOR_HORA_EXTRA) * ADICIONAL_HORA_EXTRA * linha.horas_extras;
  const valorDia = salarioBruto / 30;
  const valorFaltas = valorDia * linha.faltas;
  const descontoVt = linha.vale_transporte ? salarioBruto * ALIQUOTA_DESCONTO_VT : 0;

  const baseCalculo = arredondar(salarioBruto - valorFaltas + valorHoraExtra);

  const inss = calcularINSS(baseCalculo);
  const fgts = arredondar(baseCalculo * ALIQUOTA_FGTS);

  const baseIr = arredondar(baseCalculo - inss - linha.num_dependentes * DEDUCAO_POR_DEPENDENTE_IR);
  const ir = calcularIR(baseIr);

  const liquido = arredondar(baseCalculo - inss - ir - linha.adiantamento - descontoVt);

  return {
    empresa: linha.empresa,
    funcionario: linha.funcionario,
    cpf: linha.cpf,
    cargo: linha.cargo,
    salario_bruto: salarioBruto,
    dias_trabalhados: linha.dias_trabalhados,
    horas_extras: linha.horas_extras,
    faltas: linha.faltas,
    adiantamento: linha.adiantamento,
    num_dependentes: linha.num_dependentes,
    vale_transporte: linha.vale_transporte,
    valor_horas_extras: arredondar(valorHoraExtra),
    valor_faltas: arredondar(valorFaltas),
    desconto_vt: arredondar(descontoVt),
    base_calculo: baseCalculo,
    inss,
    fgts,
    ir,
    liquido,
  };
}

const CAMPOS_NUMERICOS = [
  "salario_bruto",
  "dias_trabalhados",
  "horas_extras",
  "faltas",
  "adiantamento",
  "num_dependentes",
];
const CAMPOS_TEXTO = ["empresa", "funcionario", "cpf", "cargo"];

function paraNumero(valor) {
  if (typeof valor === "number") return valor;
  if (typeof valor === "string" && valor.trim() !== "") return Number(valor.trim().replace(",", "."));
  return NaN;
}

function paraBooleano(valor) {
  if (typeof valor === "boolean") return valor;
  if (typeof valor === "number") return valor === 1;
  if (typeof valor === "string") {
    const normalizado = valor.trim().toLowerCase();
    return normalizado === "true" || normalizado === "verdadeiro" || normalizado === "1" || normalizado === "sim";
  }
  return false;
}

// Lê as linhas de dado da planilha (a partir da linha 2) e valida cada campo.
// Retorna { linhas, erros } — erros referenciam o número da linha no Excel (1-based).
export async function lerLinhasPlanilha(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheetInicial = workbook.worksheets[0];
  const headerPorNome = new Map(COLUNAS_FOLHA.map((coluna) => [coluna.header, coluna.key]));

  // Mapeia coluna → índice pelo texto do cabeçalho real do arquivo, não pela ordem
  // fixa de COLUNAS_FOLHA — validarColunasPlanilha garante presença, não ordem.
  const indicePorChave = new Map();
  sheetInicial.getRow(1).eachCell((cell, indiceColuna) => {
    if (typeof cell.value !== "string") return;
    const chave = headerPorNome.get(cell.value.trim().toLowerCase());
    if (chave) indicePorChave.set(chave, indiceColuna);
  });

  const linhas = [];
  const erros = [];

  const colunasFaltando = COLUNAS_FOLHA.filter((coluna) => !indicePorChave.has(coluna.key));
  if (colunasFaltando.length > 0) {
    return {
      linhas: [],
      erros: [{ linha: 1, motivos: colunasFaltando.map((coluna) => `coluna '${coluna.header}' ausente no cabeçalho`) }],
    };
  }

  const totalLinhas = sheetInicial.rowCount;

  for (let numeroLinha = 2; numeroLinha <= totalLinhas; numeroLinha++) {
    const linhaExcel = sheetInicial.getRow(numeroLinha);

    const linhaVazia = COLUNAS_FOLHA.every((coluna) => {
      const valor = linhaExcel.getCell(indicePorChave.get(coluna.key)).value;
      return valor === null || valor === undefined || valor === "";
    });
    if (linhaVazia) continue;

    const bruta = {};
    COLUNAS_FOLHA.forEach((coluna) => {
      bruta[coluna.key] = linhaExcel.getCell(indicePorChave.get(coluna.key)).value;
    });

    const errosDaLinha = [];

    CAMPOS_TEXTO.forEach((campo) => {
      if (typeof bruta[campo] !== "string" || bruta[campo].trim() === "") {
        errosDaLinha.push(`${campo} vazio ou inválido`);
      }
    });

    const linhaConvertida = { linha: numeroLinha };
    CAMPOS_TEXTO.forEach((campo) => {
      linhaConvertida[campo] = typeof bruta[campo] === "string" ? bruta[campo].trim() : bruta[campo];
    });

    CAMPOS_NUMERICOS.forEach((campo) => {
      const numero = paraNumero(bruta[campo]);
      if (Number.isNaN(numero) || numero < 0) {
        errosDaLinha.push(`${campo} deve ser um número não-negativo`);
      }
      linhaConvertida[campo] = numero;
    });

    if (!Number.isNaN(linhaConvertida.salario_bruto) && linhaConvertida.salario_bruto <= 0) {
      errosDaLinha.push("salario_bruto deve ser maior que zero");
    }

    linhaConvertida.num_dependentes = Math.round(linhaConvertida.num_dependentes) || 0;
    linhaConvertida.vale_transporte = paraBooleano(bruta.vale_transporte);

    if (errosDaLinha.length > 0) {
      erros.push({ linha: numeroLinha, motivos: errosDaLinha });
    } else {
      linhas.push(linhaConvertida);
    }
  }

  if (linhas.length === 0 && erros.length === 0) {
    erros.push({ linha: null, motivos: ["Planilha não tem nenhuma linha de dado preenchida"] });
  }

  return { linhas, erros };
}

// Gera o .xlsx modelo: cabeçalho travado (estrutura/ordem das colunas protegida)
// e células de dado destravadas, pra usuário preencher sem mexer nas colunas.
export async function gerarTemplateFolha() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Folha de Pagamento");

  sheet.columns = COLUNAS_FOLHA;

  const linhaCabecalho = sheet.getRow(1);
  linhaCabecalho.font = { bold: true };
  linhaCabecalho.eachCell((cell) => {
    cell.protection = { locked: true };
  });

  for (let numeroLinha = 2; numeroLinha <= LINHAS_DE_DADOS + 1; numeroLinha++) {
    const linha = sheet.getRow(numeroLinha);
    COLUNAS_FOLHA.forEach((_, indice) => {
      linha.getCell(indice + 1).protection = { locked: false };
    });
  }

  await sheet.protect("", {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: false,
    formatColumns: false,
    formatRows: false,
    insertRows: false,
    insertColumns: false,
    deleteRows: false,
    deleteColumns: false,
    sort: false,
    autoFilter: false,
  });

  return workbook.xlsx.writeBuffer();
}

// Confere se a planilha enviada tem todas as colunas do contrato no cabeçalho (linha 1).
// Não valida ordem nem células de dado — só que o cabeçalho não foi alterado/incompleto.
export async function validarColunasPlanilha(buffer) {
  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.load(buffer);
  } catch {
    return { valido: false, faltando: COLUNAS_FOLHA.map((coluna) => coluna.header) };
  }

  const sheet = workbook.worksheets[0];

  if (!sheet) {
    return { valido: false, faltando: COLUNAS_FOLHA.map((coluna) => coluna.header) };
  }

  const headersPresentes = new Set();
  sheet.getRow(1).eachCell((cell) => {
    if (typeof cell.value === "string") {
      headersPresentes.add(cell.value.trim().toLowerCase());
    }
  });

  const faltando = COLUNAS_FOLHA
    .map((coluna) => coluna.header)
    .filter((header) => !headersPresentes.has(header.toLowerCase()));

  return { valido: faltando.length === 0, faltando };
}

function formatarMoeda(valor) {
  return Number(valor).toFixed(2).replace(".", ",");
}

// Sem modelo próprio da Souza para holerite/relatório — layout mínimo, mas com todas
// as linhas de proventos/descontos, pra ser legível sem depender de explicação externa.
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

// Holerite individual — 1 por funcionário, a partir da linha já calculada em folha_calculos.
export function gerarHoleritePDF(calculo, mesReferenciaFormatado) {
  return documentoParaBuffer((doc) => {
    doc.fontSize(16).text("HOLERITE DE PAGAMENTO", { align: "center" });
    doc.moveDown();

    doc.fontSize(10);
    doc.text(`Empresa: ${calculo.empresa}`);
    doc.text(`Mês de referência: ${mesReferenciaFormatado}`);
    doc.moveDown(0.5);
    doc.text(`Funcionário: ${calculo.funcionario}`);
    doc.text(`CPF: ${calculo.cpf}`);
    doc.text(`Cargo: ${calculo.cargo}`);
    doc.text(`Dias trabalhados: ${calculo.dias_trabalhados}`);
    doc.moveDown();

    doc.fontSize(12).text("Proventos", { underline: true });
    doc.fontSize(10);
    doc.text(`Salário bruto: R$ ${formatarMoeda(calculo.salario_bruto)}`);
    doc.text(`Horas extras (${calculo.horas_extras}h a 50%): R$ ${formatarMoeda(calculo.valor_horas_extras)}`);
    doc.moveDown();

    doc.fontSize(12).text("Descontos", { underline: true });
    doc.fontSize(10);
    doc.text(`INSS: R$ ${formatarMoeda(calculo.inss)}`);
    doc.text(`IRRF: R$ ${formatarMoeda(calculo.ir)}`);
    doc.text(`Faltas (${calculo.faltas} dia(s)): R$ ${formatarMoeda(calculo.valor_faltas)}`);
    doc.text(`Adiantamento: R$ ${formatarMoeda(calculo.adiantamento)}`);
    doc.text(`Vale-transporte (6% do bruto): R$ ${formatarMoeda(calculo.desconto_vt)}`);
    doc.moveDown();

    doc.fontSize(9).text(`FGTS do mês (informativo, depositado pela empresa, não desconta do líquido): R$ ${formatarMoeda(calculo.fgts)}`);
    doc.moveDown();

    doc.fontSize(13).text(`Líquido a receber: R$ ${formatarMoeda(calculo.liquido)}`, { underline: true });
  });
}

// Totais agregados de uma empresa dentro de um processamento — uma planilha pode ter
// funcionários de mais de uma empresa-cliente da Souza, então isto roda por grupo.
export function calcularTotaisEmpresa(calculosDaEmpresa) {
  return calculosDaEmpresa.reduce(
    (acc, calculo) => ({
      totalFuncionarios: acc.totalFuncionarios + 1,
      totalBruto: arredondar(acc.totalBruto + Number(calculo.salario_bruto)),
      totalEncargos: arredondar(acc.totalEncargos + Number(calculo.inss) + Number(calculo.fgts) + Number(calculo.ir)),
      totalLiquido: arredondar(acc.totalLiquido + Number(calculo.liquido)),
    }),
    { totalFuncionarios: 0, totalBruto: 0, totalEncargos: 0, totalLiquido: 0 },
  );
}

// Relatório de fechamento — 1 por empresa por processamento, com o resumo agregado
// e a lista de funcionários incluídos nesse fechamento.
export function gerarRelatorioFechamentoPDF({ empresa, mesReferenciaFormatado, calculos, totais }) {
  return documentoParaBuffer((doc) => {
    doc.fontSize(16).text("RELATÓRIO DE FECHAMENTO DE FOLHA", { align: "center" });
    doc.moveDown();

    doc.fontSize(10);
    doc.text(`Empresa: ${empresa}`);
    doc.text(`Mês de referência: ${mesReferenciaFormatado}`);
    doc.moveDown();

    doc.fontSize(12).text("Totais", { underline: true });
    doc.fontSize(10);
    doc.text(`Total de funcionários: ${totais.totalFuncionarios}`);
    doc.text(`Total bruto: R$ ${formatarMoeda(totais.totalBruto)}`);
    doc.text(`Total de encargos (INSS + FGTS + IRRF): R$ ${formatarMoeda(totais.totalEncargos)}`);
    doc.text(`Total líquido: R$ ${formatarMoeda(totais.totalLiquido)}`);
    doc.moveDown();

    doc.fontSize(12).text("Funcionários incluídos neste fechamento", { underline: true });
    doc.fontSize(9);
    calculos.forEach((calculo) => {
      doc.text(`${calculo.funcionario} — ${calculo.cargo} — líquido: R$ ${formatarMoeda(calculo.liquido)}`);
    });
  });
}
