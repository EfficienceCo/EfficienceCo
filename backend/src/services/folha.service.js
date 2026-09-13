import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { cpfValido, normalizarCpf } from "../utils/cpf.util.js";

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

// ---------------------------------------------------------------------------
// Tabelas fiscais versionadas por competência (BUG-FOLHA-01 / #437).
//
// O motor seleciona o conjunto vigente pela competência do processamento, então
// recalcular uma folha antiga continua usando a tabela da época — nada de
// reescrever holerite histórico com número de outro ano.
//
// `inss.faixas`         faixas marginais (cada parcela da base paga a alíquota
//                       da sua própria faixa).
// `inss.tetoContribuicao` contribuição fixa acima do teto salarial (o VALOR
//                       PUBLICADO, que não é exatamente o somatório marginal).
//                       `null` = usar o somatório marginal até o teto.
// `irrf.faixas`         tabela progressiva mensal (alíquota + parcela a deduzir).
// `irrf.descontoSimplificado` dedução única alternativa; `null` = motor sem a
//                       regra da dedução mais vantajosa (comportamento legado).
// `irrf.reducaoMensal`  redução do IRRF na fonte da Lei 15.270/2025; `null` =
//                       sem redução.
// ---------------------------------------------------------------------------

// Conjunto legado de 2024, exatamente o que o motor usava fixo antes do #437.
// Fontes: Portaria Interministerial MPS/MF 2024; Instrução Normativa RFB (fev/2024).
const TABELA_FOLHA_2024 = {
  vigenciaInicio: "2024-01",
  vigenciaFim: "2024-12",
  inss: {
    faixas: [
      { limite: 1412.00, aliquota: 0.075 },
      { limite: 2666.68, aliquota: 0.09 },
      { limite: 4000.03, aliquota: 0.12 },
      { limite: 7786.02, aliquota: 0.14 },
    ],
    tetoContribuicao: 908.85,
  },
  irrf: {
    faixas: [
      { limite: 2259.20, aliquota: 0, deducao: 0 },
      { limite: 2826.65, aliquota: 0.075, deducao: 169.44 },
      { limite: 3751.05, aliquota: 0.15, deducao: 381.44 },
      { limite: 4664.68, aliquota: 0.225, deducao: 662.77 },
      { limite: Infinity, aliquota: 0.275, deducao: 896.00 },
    ],
    deducaoPorDependente: 189.59,
    descontoSimplificado: null,
    reducaoMensal: null,
  },
};

// Em 2025 o INSS mudou em janeiro e a tabela mensal do IRRF mudou novamente em
// maio. Manter duas vigências impede aplicar retroativamente o aumento da faixa
// de isenção aos meses de janeiro a abril.
// Fontes oficiais: Portaria Interministerial MPS/MF nº 6/2025 e tabela IRPF 2025
// da Receita Federal.
const INSS_2025 = {
  faixas: [
    { limite: 1518.00, aliquota: 0.075 },
    { limite: 2793.88, aliquota: 0.09 },
    { limite: 4190.83, aliquota: 0.12 },
    { limite: 8157.41, aliquota: 0.14 },
  ],
  tetoContribuicao: 951.62,
};

const TABELA_FOLHA_2025_JAN_ABR = {
  vigenciaInicio: "2025-01",
  vigenciaFim: "2025-04",
  inss: INSS_2025,
  irrf: {
    faixas: [
      { limite: 2259.20, aliquota: 0, deducao: 0 },
      { limite: 2826.65, aliquota: 0.075, deducao: 169.44 },
      { limite: 3751.05, aliquota: 0.15, deducao: 381.44 },
      { limite: 4664.68, aliquota: 0.225, deducao: 662.77 },
      { limite: Infinity, aliquota: 0.275, deducao: 896.00 },
    ],
    deducaoPorDependente: 189.59,
    descontoSimplificado: 564.80,
    reducaoMensal: null,
  },
};

const TABELA_FOLHA_2025_MAI_DEZ = {
  vigenciaInicio: "2025-05",
  vigenciaFim: "2025-12",
  inss: INSS_2025,
  irrf: {
    faixas: [
      { limite: 2428.80, aliquota: 0, deducao: 0 },
      { limite: 2826.65, aliquota: 0.075, deducao: 182.16 },
      { limite: 3751.05, aliquota: 0.15, deducao: 394.16 },
      { limite: 4664.68, aliquota: 0.225, deducao: 675.49 },
      { limite: Infinity, aliquota: 0.275, deducao: 908.73 },
    ],
    deducaoPorDependente: 189.59,
    descontoSimplificado: 607.20,
    reducaoMensal: null,
  },
};

// INSS e IRRF de 2026. Fontes oficiais:
//  - INSS 2026 (reajuste INPC 3,90%, salário mínimo R$ 1.621,00, teto R$ 8.475,55):
//    gov.br/inss › inscricao-e-contribuicao › tabela-de-contribuicao-mensal
//  - IRRF 2026 + redução mensal (Lei 15.270/2025):
//    gov.br/receitafederal › meu-imposto-de-renda › tabelas/2026
//    gov.br/receitafederal › ... › exemplos-de-aplicacao-da-lei-15-270-2025
const TABELA_FOLHA_2026 = {
  vigenciaInicio: "2026-01",
  vigenciaFim: "2026-12",
  inss: {
    faixas: [
      { limite: 1621.00, aliquota: 0.075 },
      { limite: 2902.84, aliquota: 0.09 },
      { limite: 4354.27, aliquota: 0.12 },
      { limite: 8475.55, aliquota: 0.14 },
    ],
    // Acima do teto salarial a contribuição é o somatório marginal até 8.475,55
    // (~R$ 988,09), usado com precisão cheia na base do IRRF — ver calcularINSS.
    tetoContribuicao: null,
  },
  irrf: {
    faixas: [
      { limite: 2428.80, aliquota: 0, deducao: 0 },
      { limite: 2826.65, aliquota: 0.075, deducao: 182.16 },
      { limite: 3751.05, aliquota: 0.15, deducao: 394.16 },
      { limite: 4664.68, aliquota: 0.225, deducao: 675.49 },
      { limite: Infinity, aliquota: 0.275, deducao: 908.73 },
    ],
    deducaoPorDependente: 189.59,
    descontoSimplificado: 607.20,
    // Redução do IRRF na fonte (Lei 15.270/2025), vigente desde jan/2026, sobre o
    // rendimento tributável do mês (NÃO sobre a base após INSS):
    //   rendimento <= 5.000,00           -> imposto integralmente zerado
    //   5.000,01 <= rendimento <= 7.350,00 -> redutor = parcela - fator * rendimento
    //   rendimento > 7.350,00            -> sem redução
    reducaoMensal: {
      isencaoAte: 5000.00,
      faseOutAte: 7350.00,
      parcela: 978.62,
      fator: 0.133145,
    },
  },
};

// Ordem crescente por vigência — resolverTabelaFolha depende disso.
const TABELAS_FOLHA = [
  TABELA_FOLHA_2024,
  TABELA_FOLHA_2025_JAN_ABR,
  TABELA_FOLHA_2025_MAI_DEZ,
  TABELA_FOLHA_2026,
];

// Resolve o conjunto de tabelas vigente para a competência (aceita "YYYY-MM" ou
// "YYYY-MM-DD"). Lança se a competência for anterior à tabela mais antiga — falhar
// explícito é melhor do que aplicar a tabela errada em silêncio.
export function resolverTabelaFolha(competencia) {
  const chave = String(competencia ?? "").slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(chave)) {
    throw new Error(`Competência inválida para resolução da tabela de folha: ${competencia}`);
  }

  const vigente = TABELAS_FOLHA
    .filter(
      (tabela) =>
        tabela.vigenciaInicio <= chave &&
        (!tabela.vigenciaFim || chave <= tabela.vigenciaFim),
    )
    .at(-1);

  if (!vigente) {
    throw new Error(`Nenhuma tabela de folha cadastrada para a competência ${chave}`);
  }

  return vigente;
}

const ALIQUOTA_FGTS = 0.08;
const ALIQUOTA_DESCONTO_VT = 0.06;
const DIVISOR_HORA_EXTRA = 220;
const ADICIONAL_HORA_EXTRA = 1.5;

function arredondar(valor) {
  // Math.round(x * 100) / 100 sozinho erra a meia-unidade exata: o produto x * 100
  // "cai para baixo" por erro de representação binária (ex.: 1621 * 0,075 chega como
  // 121.57499999999999 e arredondaria para 121,57 em vez de 121,58 — que é o valor
  // que INSS/RFB e o lote de reconciliação do #437 esperam). O nudge de 1 epsilon
  // relativo, afastando de zero, corrige a fronteira .xx5 sem mexer em nenhum outro valor.
  const cents = valor * 100;
  return Math.round(cents + Math.sign(cents) * Number.EPSILON * Math.abs(cents)) / 100;
}

// INSS é calculado por faixas marginais: cada pedaço da base paga a alíquota da sua
// própria faixa, não a alíquota da faixa final sobre o total. Acima do teto salarial,
// a contribuição é fixa.
//
// Retorna o valor SEM arredondar. Quem exibe/persiste arredonda (ver
// calcularFolhaFuncionario), mas a base do IRRF usa a precisão cheia: no topo da
// tabela, arredondar o INSS antes de compor a base do IR desloca o líquido do lote
// de reconciliação do #437 em 1 centavo.
export function calcularINSS(baseCalculo, tabelaInss) {
  if (baseCalculo <= 0) return 0;

  const { faixas, tetoContribuicao } = tabelaInss;

  let inss = 0;
  let limiteAnterior = 0;

  for (const { limite, aliquota } of faixas) {
    if (baseCalculo <= limiteAnterior) break;
    const valorNaFaixa = Math.min(baseCalculo, limite) - limiteAnterior;
    inss += valorNaFaixa * aliquota;
    limiteAnterior = limite;
  }

  const tetoSalarial = faixas[faixas.length - 1].limite;
  if (baseCalculo > tetoSalarial && tetoContribuicao != null) {
    return tetoContribuicao;
  }

  return inss;
}

// A base do IRRF precisa ser persistida exatamente como foi usada no cálculo.
// Em tabelas que oferecem desconto simplificado, escolhe a maior dedução entre
// ele e as deduções legais (INSS + dependentes).
export function calcularBaseIR({ baseCalculo, inss, numDependentes }, tabelaIrrf) {
  if (baseCalculo <= 0) return 0;

  const { deducaoPorDependente, descontoSimplificado } = tabelaIrrf;
  const deducaoLegal = inss + numDependentes * deducaoPorDependente;
  const deducao = descontoSimplificado != null
    ? Math.max(deducaoLegal, descontoSimplificado)
    : deducaoLegal;

  return arredondar(Math.max(0, baseCalculo - deducao));
}

// IRRF mensal: tabela progressiva (alíquota da faixa onde a base cai, menos a
// parcela a deduzir dela própria) — não é cálculo marginal como o INSS. Aplica a
// redução mensal da Lei 15.270/2025 quando a tabela vigente a define. Recebe o
// INSS SEM arredondar. Retorna o IRRF final arredondado.
export function calcularIR(dados, tabelaIrrf) {
  const { baseCalculo } = dados;
  if (baseCalculo <= 0) return 0;

  const { faixas, reducaoMensal } = tabelaIrrf;
// dedução mais vantajosa (simplificada × legal) e a redução mensal da Lei
// 15.270/2025 quando a tabela vigente as define (o motor legado de 2024 não tinha
// nenhuma das duas). Recebe o INSS SEM arredondar. Retorna o IRRF final arredondado.
export function calcularIR({ baseCalculo, inss, numDependentes }, tabelaIrrf) {
  if (baseCalculo <= 0) return 0;

  const { faixas, deducaoPorDependente, descontoSimplificado, reducaoMensal } = tabelaIrrf;

  // Redução mensal: até o piso de isenção o imposto é integralmente zerado,
  // independentemente do que a tabela progressiva apuraria.
  if (reducaoMensal && baseCalculo <= reducaoMensal.isencaoAte) return 0;

  const baseIr = calcularBaseIR(dados, tabelaIrrf);
  if (baseIr <= 0) return 0;

  const faixa = faixas.find(({ limite }) => baseIr <= limite);
  const impostoTabela = Math.max(0, baseIr * faixa.aliquota - faixa.deducao);

  const deducaoLegal = inss + numDependentes * deducaoPorDependente;
  const deducao = descontoSimplificado != null
    ? Math.max(deducaoLegal, descontoSimplificado)
    : deducaoLegal;

  const baseIr = baseCalculo - deducao;
  if (baseIr <= 0) return 0;

  const faixa = faixas.find(({ limite }) => baseIr <= limite);
  const impostoTabela = Math.max(0, baseIr * faixa.aliquota - faixa.deducao);

  // Fase de saída da redução: o redutor decresce linearmente até zerar no teto.
  const redutor = reducaoMensal && baseCalculo <= reducaoMensal.faseOutAte
    ? Math.max(0, reducaoMensal.parcela - reducaoMensal.fator * baseCalculo)
    : 0;

  return arredondar(Math.max(0, impostoTabela - redutor));
}

// Calcula todos os valores de folha de um funcionário a partir da linha lida da
// planilha. `competencia` ("YYYY-MM" ou "YYYY-MM-DD") seleciona a tabela fiscal
// vigente — obrigatória, o cálculo não tem default de ano.
// Fórmula do líquido: bruto − faltas + horas_extras − INSS − IR − adiantamento − desconto_vt.
export function calcularFolhaFuncionario(linha, competencia) {
  const { inss: tabelaInss, irrf: tabelaIrrf } = resolverTabelaFolha(competencia);

  const salarioBruto = linha.salario_bruto;
  const valorHoraExtra = (salarioBruto / DIVISOR_HORA_EXTRA) * ADICIONAL_HORA_EXTRA * linha.horas_extras;
  const valorDia = salarioBruto / 30;
  const valorFaltas = valorDia * linha.faltas;
  const descontoVt = linha.vale_transporte ? salarioBruto * ALIQUOTA_DESCONTO_VT : 0;

  const baseCalculo = arredondar(salarioBruto - valorFaltas + valorHoraExtra);

  const inssPreciso = calcularINSS(baseCalculo, tabelaInss);
  const inss = arredondar(inssPreciso);
  const fgts = arredondar(baseCalculo * ALIQUOTA_FGTS);

  const dadosIrrf = {
    baseCalculo,
    inss: inssPreciso,
    numDependentes: linha.num_dependentes,
  };
  const baseIr = calcularBaseIR(dadosIrrf, tabelaIrrf);
  const ir = calcularIR(dadosIrrf, tabelaIrrf);
  const ir = calcularIR(
    { baseCalculo, inss: inssPreciso, numDependentes: linha.num_dependentes },
    tabelaIrrf,
  );

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
    base_ir: baseIr,
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
const CAMPOS_TEXTO = ["empresa", "funcionario", "cargo"];

const VALORES_VT_ACEITOS =
  "SIM, NAO, TRUE, FALSE, VERDADEIRO, FALSO, 1, 0 (também boolean nativo e fórmula com esses resultados)";
const VT_TRUE = new Set(["true", "verdadeiro", "sim", "1"]);
const VT_FALSE = new Set(["false", "falso", "nao", "não", "0"]);

// ExcelJS entrega célula de fórmula como { formula, result } e célula de texto formatado
// como { richText: [...] } — nenhum dos dois é boolean/number/string direto. Sem isso,
// um campo preenchido via fórmula (comum em checkbox do Excel ou cópia de outra planilha)
// caía direto no valor "não reconhecido" de cada parser, sem nenhum erro reportado.
function desembrulharValorCelula(valor) {
  if (valor && typeof valor === "object") {
    if ("result" in valor) return desembrulharValorCelula(valor.result);
    if (Array.isArray(valor.richText)) return valor.richText.map((parte) => parte.text).join("");
  }
  return valor;
}

function paraNumero(valorBruto) {
  const valor = desembrulharValorCelula(valorBruto);
  if (typeof valor === "number") return valor;
  if (typeof valor === "string" && valor.trim() !== "") {
    const texto = valor.trim();
    // Decide o separador decimal pelo que aparece por último ("1.500,00" BR vs
    // "1,500.00" US) e remove o outro como separador de milhar. Com um único
    // separador, assume vírgula como decimal (planilha é preenchida em português).
    const ultimaVirgula = texto.lastIndexOf(",");
    const ultimoPonto = texto.lastIndexOf(".");
    let normalizado = texto;
    if (ultimaVirgula > -1 && ultimoPonto > -1) {
      normalizado = ultimaVirgula > ultimoPonto
        ? texto.replace(/\./g, "").replace(",", ".")
        : texto.replace(/,/g, "");
    } else if (ultimaVirgula > -1) {
      normalizado = texto.replace(",", ".");
    }
    return Number(normalizado);
  }
  return NaN;
}

// Domínio explícito: valor não reconhecido não vira false silencioso.
function paraBooleano(valorBruto) {
  const valor = desembrulharValorCelula(valorBruto);
  if (typeof valor === "boolean") return { ok: true, valor };
  if (typeof valor === "number") {
    if (valor === 1) return { ok: true, valor: true };
    if (valor === 0) return { ok: true, valor: false };
    return { ok: false };
  }
  if (typeof valor === "string") {
    const normalizado = valor.trim().toLowerCase();
    if (VT_TRUE.has(normalizado)) return { ok: true, valor: true };
    if (VT_FALSE.has(normalizado)) return { ok: true, valor: false };
    return { ok: false };
  }
  return { ok: false };
}

function valorCelulaParaTextoCpf(valorBruto) {
  const valor = desembrulharValorCelula(valorBruto);
  if (valor === null || valor === undefined || valor === "") return "";
  if (typeof valor === "number" && Number.isFinite(valor)) return String(Math.trunc(valor));
  if (typeof valor === "string") return valor.trim();
  return "";
}

// Lê as linhas de dado da planilha (a partir da linha 2) e valida cada campo.
// Retorna { linhas, erros } — erros referenciam o número da linha no Excel (1-based).
// Se houver qualquer erro, linhas fica vazia (sem persistência parcial).
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
  const cpfPorLinha = new Map();

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

    const cpfBruto = desembrulharValorCelula(bruta.cpf);
    const cpfTexto = valorCelulaParaTextoCpf(bruta.cpf);
    const cpfDigitos = normalizarCpf(cpfTexto || bruta.cpf);
    const cpfVeioComoNumero = typeof cpfBruto === "number";
    if (!cpfTexto && cpfDigitos.length === 0) {
      errosDaLinha.push("cpf vazio ou inválido");
      linhaConvertida.cpf = "";
    } else if (!cpfValido(cpfDigitos)) {
      if (cpfVeioComoNumero && cpfDigitos.length !== 11) {
        errosDaLinha.push(
          "cpf inválido: célula numérica perde zero à esquerda — formate a coluna como texto",
        );
      } else {
        errosDaLinha.push("cpf inválido");
      }
      linhaConvertida.cpf = cpfDigitos;
    } else {
      linhaConvertida.cpf = cpfDigitos;
    }

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

    const vt = paraBooleano(bruta.vale_transporte);
    if (!vt.ok) {
      errosDaLinha.push(
        `vale_transporte inválido; valores aceitos: ${VALORES_VT_ACEITOS}`,
      );
      linhaConvertida.vale_transporte = false;
    } else {
      linhaConvertida.vale_transporte = vt.valor;
    }

    if (errosDaLinha.length > 0) {
      erros.push({ linha: numeroLinha, motivos: errosDaLinha });
    } else {
      linhas.push(linhaConvertida);
      if (linhaConvertida.cpf) {
        const ocorrencias = cpfPorLinha.get(linhaConvertida.cpf) ?? [];
        ocorrencias.push(numeroLinha);
        cpfPorLinha.set(linhaConvertida.cpf, ocorrencias);
      }
    }
  }

  for (const [, numerosLinha] of cpfPorLinha) {
    if (numerosLinha.length < 2) continue;
    const listaLinhas = numerosLinha.join(", ");
    const motivo = `cpf duplicado nas linhas ${listaLinhas}`;
    for (const numeroLinha of numerosLinha) {
      erros.push({ linha: numeroLinha, motivos: [motivo] });
    }
  }

  if (linhas.length === 0 && erros.length === 0) {
    erros.push({ linha: null, motivos: ["Planilha não tem nenhuma linha de dado preenchida"] });
  }

  if (erros.length > 0) {
    return { linhas: [], erros };
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

    const celulaVt = linha.getCell(COLUNAS_FOLHA.findIndex((c) => c.key === "vale_transporte") + 1);
    celulaVt.dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"SIM,NAO"'],
      showErrorMessage: true,
      errorTitle: "Vale-transporte",
      error: "Use SIM ou NAO (também TRUE/FALSE, 1/0 ou boolean nativo).",
    };
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

// Desenha uma célula com borda e, opcionalmente, um rótulo pequeno acima do valor
// (padrão "grid de holerite": rótulo em cima, valor embaixo, sem centralização vertical).
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

// Uma linha de células lado a lado, cada uma com sua própria largura (em pt).
function desenharLinhaCelulas(doc, x, y, altura, colunas) {
  let cursorX = x;
  colunas.forEach((coluna) => {
    desenharCelula(doc, cursorX, y, coluna.largura, altura, coluna.texto, coluna);
    cursorX += coluna.largura;
  });
}

// Header da tabela de verbas — extraído à parte porque é redesenhado no topo de cada
// página caso a lista de verbas precise quebrar (raro, mas o layout precisa suportar).
function desenharHeaderTabelaVerbas(doc, x, y, colunas) {
  let cursorX = x;
  colunas.forEach((coluna) => {
    doc.font("Helvetica-Bold").fontSize(7).fillColor("black")
      .text(coluna.rotulo, cursorX + 3, y + 5, { width: coluna.largura - 6, align: coluna.alinhamento || "left" });
    cursorX += coluna.largura;
  });
}

function desenharLinhaVerba(doc, x, y, colunas, linha) {
  let cursorX = x;
  colunas.forEach((coluna) => {
    doc.font("Helvetica").fontSize(8).fillColor("black")
      .text(linha[coluna.chave] ?? "", cursorX + 3, y + 3, { width: coluna.largura - 6, align: coluna.alinhamento || "left" });
    cursorX += coluna.largura;
  });
}

// Fecha um segmento da tabela de verbas com moldura externa + divisórias verticais entre
// colunas — sem linha entre as linhas de dado, só a moldura (padrão do holerite de referência).
function fecharSegmentoTabelaVerbas(doc, x, yTopo, yFim, colunas) {
  const larguraTotal = colunas.reduce((soma, coluna) => soma + coluna.largura, 0);
  doc.lineWidth(0.5).rect(x, yTopo, larguraTotal, yFim - yTopo).stroke();
  let cursorX = x;
  for (let i = 0; i < colunas.length - 1; i++) {
    cursorX += colunas[i].largura;
    doc.moveTo(cursorX, yTopo).lineTo(cursorX, yFim).stroke();
  }
}

// Linhas de verba (proventos/descontos) a partir dos campos já calculados em folha_calculos.
// Códigos de verba são fictícios (não existe tabela de verbas real) — só servem pra imitar
// o formato visual de um holerite de verdade. Linhas sem valor aplicável (ex: sem faltas,
// sem adiantamento) são omitidas em vez de aparecer zeradas.
function montarLinhasVerbas(calculo) {
  const linhas = [
    {
      verba: "0001",
      descricao: "SALARIO BASE",
      referencia: String(calculo.dias_trabalhados),
      proventos: formatarMoeda(calculo.salario_bruto),
      descontos: "",
    },
  ];

  if (Number(calculo.horas_extras) > 0) {
    linhas.push({
      verba: "0002",
      descricao: "HORAS EXTRAS 50%",
      referencia: String(calculo.horas_extras),
      proventos: formatarMoeda(calculo.valor_horas_extras),
      descontos: "",
    });
  }

  if (Number(calculo.faltas) > 0) {
    linhas.push({
      verba: "0010",
      descricao: "FALTAS",
      referencia: String(calculo.faltas),
      proventos: "",
      descontos: formatarMoeda(calculo.valor_faltas),
    });
  }

  linhas.push({
    verba: "0011",
    descricao: "INSS",
    referencia: formatarMoeda(calculo.base_calculo),
    proventos: "",
    descontos: formatarMoeda(calculo.inss),
  });

  linhas.push({
    verba: "0012",
    descricao: "IRRF",
    referencia: "",
    proventos: "",
    descontos: formatarMoeda(calculo.ir),
  });

  if (Number(calculo.adiantamento) > 0) {
    linhas.push({
      verba: "0013",
      descricao: "ADIANTAMENTO SALARIAL",
      referencia: "",
      proventos: "",
      descontos: formatarMoeda(calculo.adiantamento),
    });
  }

  if (calculo.vale_transporte && Number(calculo.desconto_vt) > 0) {
    linhas.push({
      verba: "0014",
      descricao: "VALE-TRANSPORTE (6%)",
      referencia: "",
      proventos: "",
      descontos: formatarMoeda(calculo.desconto_vt),
    });
  }

  return linhas;
}

// Linha de bases/totais do rodapé do holerite. BASE FGTS reaproveita base_calculo
// (não existe base de FGTS isolada persistida). BASE IRRF usa a base_ir realmente
// calculada e persistida em folha_calculos; só cai para "-" quando não há imposto
// retido (IRRF genuinamente 0) ou quando a base não foi persistida — caso de
// linhas anteriores à migration 89.sql, onde exibir "0,00" seria um número falso.
export function montarCelulasBases(calculo) {
  const totalProventos = Number(calculo.salario_bruto) + Number(calculo.valor_horas_extras);
  const totalDescontos =
    Number(calculo.inss) + Number(calculo.ir) + Number(calculo.valor_faltas) +
    Number(calculo.adiantamento) + Number(calculo.desconto_vt);

  const baseIrDisponivel = calculo.base_ir != null && Number.isFinite(Number(calculo.base_ir));

  return [
    { rotulo: "SALAR. BASE", texto: formatarMoeda(calculo.salario_bruto) },
    { rotulo: "SAL. CONTR.", texto: formatarMoeda(calculo.base_calculo) },
    { rotulo: "BASE FGTS", texto: formatarMoeda(calculo.base_calculo) },
    { rotulo: "FGTS MES", texto: formatarMoeda(calculo.fgts) },
    { rotulo: "BASE IRRF", texto: baseIrDisponivel ? formatarMoeda(calculo.base_ir) : "-" },
    { rotulo: "DEP IR", texto: String(calculo.num_dependentes) },
    { rotulo: "TOT. PROVENTOS", texto: formatarMoeda(totalProventos) },
    { rotulo: "TOT. DESCONTOS", texto: formatarMoeda(totalDescontos) },
  ];
}

const COLUNAS_TABELA_VERBAS = (larguraUtil) => [
  { chave: "verba", largura: larguraUtil * 0.1, rotulo: "VERBA" },
  { chave: "descricao", largura: larguraUtil * 0.44, rotulo: "DESCRIÇÃO DA VERBA" },
  { chave: "referencia", largura: larguraUtil * 0.12, rotulo: "REFER" },
  { chave: "proventos", largura: larguraUtil * 0.17, rotulo: "PROVENTOS", alinhamento: "right" },
  { chave: "descontos", largura: larguraUtil * 0.17, rotulo: "DESCONTOS", alinhamento: "right" },
];

// Holerite individual — 1 por funcionário, a partir da linha já calculada em folha_calculos.
// Layout imita o padrão de holerite brasileiro (caixa com borda, grid de dados, tabela de
// verbas, linha de bases/totais) — sem logo/identidade de empresa, só texto e bordas.
export function gerarHoleritePDF(calculo, mesReferenciaFormatado) {
  return documentoParaBuffer((doc) => {
    const x0 = doc.page.margins.left;
    const larguraUtil = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const limiteInferior = doc.page.height - doc.page.margins.bottom;
    const yInicio = doc.page.margins.top;
    let y = yInicio;
    let houvePaginacao = false;

    doc.font("Helvetica-Bold").fontSize(12).fillColor("black")
      .text("DEMONSTRATIVO DE PAGAMENTO", x0, y + 6, { width: larguraUtil, align: "center" });
    y += 26;
    doc.lineWidth(0.5).moveTo(x0, y).lineTo(x0 + larguraUtil, y).stroke();

    doc.font("Helvetica-Bold").fontSize(11).fillColor("black")
      .text(calculo.empresa, x0 + 6, y + 8, { width: larguraUtil * 0.6 });
    doc.font("Helvetica").fontSize(9)
      .text(`Referência: ${mesReferenciaFormatado}`, x0 + larguraUtil * 0.6, y + 10, {
        width: larguraUtil * 0.4 - 6,
        align: "right",
      });
    y += 26;
    doc.moveTo(x0, y).lineTo(x0 + larguraUtil, y).stroke();

    const alturaInfo = 24;
    desenharLinhaCelulas(doc, x0, y, alturaInfo, [
      { largura: larguraUtil * 0.4, rotulo: "TRABALHADOR", texto: calculo.funcionario },
      { largura: larguraUtil * 0.2, rotulo: "CPF", texto: calculo.cpf },
      { largura: larguraUtil * 0.25, rotulo: "CARGO", texto: calculo.cargo },
      { largura: larguraUtil * 0.15, rotulo: "DIAS TRAB.", texto: String(calculo.dias_trabalhados) },
    ]);
    y += alturaInfo;

    const colunasVerba = COLUNAS_TABELA_VERBAS(larguraUtil);
    const alturaHeaderTabela = 16;
    const alturaLinhaVerba = 14;

    let yTabelaTopo = y;
    desenharHeaderTabelaVerbas(doc, x0, y, colunasVerba);
    y += alturaHeaderTabela;

    montarLinhasVerbas(calculo).forEach((linha) => {
      if (y + alturaLinhaVerba > limiteInferior) {
        fecharSegmentoTabelaVerbas(doc, x0, yTabelaTopo, y, colunasVerba);
        doc.addPage();
        houvePaginacao = true;
        y = doc.page.margins.top;
        yTabelaTopo = y;
        desenharHeaderTabelaVerbas(doc, x0, y, colunasVerba);
        y += alturaHeaderTabela;
      }
      desenharLinhaVerba(doc, x0, y, colunasVerba, linha);
      y += alturaLinhaVerba;
    });
    fecharSegmentoTabelaVerbas(doc, x0, yTabelaTopo, y, colunasVerba);

    const alturaBases = 26;
    const alturaTotalLiquido = 32;
    if (y + alturaBases + alturaTotalLiquido > limiteInferior) {
      doc.addPage();
      houvePaginacao = true;
      y = doc.page.margins.top;
    }

    const celulasBases = montarCelulasBases(calculo);
    const larguraCelulaBase = larguraUtil / celulasBases.length;
    desenharLinhaCelulas(
      doc,
      x0,
      y,
      alturaBases,
      celulasBases.map((celula) => ({ ...celula, largura: larguraCelulaBase, alinhamento: "right", tamanho: 7 })),
    );
    y += alturaBases;

    desenharCelula(doc, x0, y, larguraUtil, alturaTotalLiquido, `R$ ${formatarMoeda(calculo.liquido)}`, {
      rotulo: "TOTAL LÍQUIDO",
      alinhamento: "right",
      negrito: true,
      tamanho: 14,
    });
    y += alturaTotalLiquido;

    if (!houvePaginacao) {
      doc.lineWidth(0.8).rect(x0, yInicio, larguraUtil, y - yInicio).stroke();
    }
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

const COLUNAS_TABELA_FUNCIONARIOS = (larguraUtil) => [
  { chave: "funcionario", largura: larguraUtil * 0.5, rotulo: "FUNCIONÁRIO" },
  { chave: "cargo", largura: larguraUtil * 0.3, rotulo: "CARGO" },
  { chave: "liquido", largura: larguraUtil * 0.2, rotulo: "LÍQUIDO", alinhamento: "right" },
];

// Relatório de fechamento — 1 por empresa por processamento, com o resumo agregado
// e a lista de funcionários incluídos nesse fechamento. Mesmo vocabulário visual do
// holerite (caixa com borda, tabela com header em negrito), simplificado: aqui não há
// grid de verbas, só uma lista tabular de funcionários.
export function gerarRelatorioFechamentoPDF({ empresa, mesReferenciaFormatado, calculos, totais }) {
  return documentoParaBuffer((doc) => {
    const x0 = doc.page.margins.left;
    const larguraUtil = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const limiteInferior = doc.page.height - doc.page.margins.bottom;
    const yInicio = doc.page.margins.top;
    let y = yInicio;
    let houvePaginacao = false;

    doc.font("Helvetica-Bold").fontSize(12).fillColor("black")
      .text("RELATÓRIO DE FECHAMENTO DE FOLHA", x0, y + 6, { width: larguraUtil, align: "center" });
    y += 26;
    doc.lineWidth(0.5).moveTo(x0, y).lineTo(x0 + larguraUtil, y).stroke();

    doc.font("Helvetica-Bold").fontSize(11).fillColor("black")
      .text(empresa, x0 + 6, y + 8, { width: larguraUtil * 0.6 });
    doc.font("Helvetica").fontSize(9)
      .text(`Referência: ${mesReferenciaFormatado}`, x0 + larguraUtil * 0.6, y + 10, {
        width: larguraUtil * 0.4 - 6,
        align: "right",
      });
    y += 26;
    doc.moveTo(x0, y).lineTo(x0 + larguraUtil, y).stroke();

    const alturaTotais = 26;
    const larguraCelulaTotal = larguraUtil / 4;
    desenharLinhaCelulas(doc, x0, y, alturaTotais, [
      { largura: larguraCelulaTotal, rotulo: "TOTAL FUNCIONÁRIOS", texto: String(totais.totalFuncionarios), alinhamento: "right" },
      { largura: larguraCelulaTotal, rotulo: "TOTAL BRUTO", texto: formatarMoeda(totais.totalBruto), alinhamento: "right" },
      { largura: larguraCelulaTotal, rotulo: "TOTAL ENCARGOS", texto: formatarMoeda(totais.totalEncargos), alinhamento: "right" },
      { largura: larguraCelulaTotal, rotulo: "TOTAL LÍQUIDO", texto: formatarMoeda(totais.totalLiquido), alinhamento: "right", negrito: true },
    ]);
    y += alturaTotais;
    y += 10;

    const colunasFuncionarios = COLUNAS_TABELA_FUNCIONARIOS(larguraUtil);
    const alturaHeaderTabela = 16;
    const alturaLinha = 14;

    let yTabelaTopo = y;
    desenharHeaderTabelaVerbas(doc, x0, y, colunasFuncionarios);
    y += alturaHeaderTabela;

    calculos.forEach((calculo) => {
      if (y + alturaLinha > limiteInferior) {
        fecharSegmentoTabelaVerbas(doc, x0, yTabelaTopo, y, colunasFuncionarios);
        doc.addPage();
        houvePaginacao = true;
        y = doc.page.margins.top;
        yTabelaTopo = y;
        desenharHeaderTabelaVerbas(doc, x0, y, colunasFuncionarios);
        y += alturaHeaderTabela;
      }
      desenharLinhaVerba(doc, x0, y, colunasFuncionarios, {
        funcionario: calculo.funcionario,
        cargo: calculo.cargo,
        liquido: formatarMoeda(calculo.liquido),
      });
      y += alturaLinha;
    });
    fecharSegmentoTabelaVerbas(doc, x0, yTabelaTopo, y, colunasFuncionarios);

    if (!houvePaginacao) {
      doc.lineWidth(0.8).rect(x0, yInicio, larguraUtil, y - yInicio).stroke();
    }
  });
}
