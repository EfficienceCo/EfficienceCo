import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { arredondar, cnpjValido, cpfValido, normalizarCpf } from "../utils/comum.util.js";

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

// Coluna opcional (BUG-APUR-12 / #612): fica fora de COLUNAS_FOLHA para que
// planilhas antigas, sem ela, continuem válidas — ausente ou vazia = EMPREGADO.
// SOCIO marca retirada de pró-labore: entra na FS12 do Fator R (LC 123 art. 18
// §24; Res. CGSN 140/2018 art. 26), mas sem FGTS (sócio não é empregado).
export const COLUNA_CATEGORIA = { header: "categoria", key: "categoria", width: 14 };
const CATEGORIAS_ACEITAS = "EMPREGADO, SOCIO (vazio = EMPREGADO)";
const CATEGORIA_POR_TEXTO = new Map([
  ["empregado", "empregado"],
  ["socio", "socio"],
  ["sócio", "socio"],
]);

// Coluna opcional (#745): CNPJ do empregador, impresso no holerite e no relatório de
// fechamento. Vazia = usa o cadastro do cliente quando dá para ligar a empresa a ele.
export const COLUNA_CNPJ = { header: "cnpj_empresa", key: "cnpj_empresa", width: 20 };

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

// Competência bem formada, mas fora de todas as vigências cadastradas (anterior à
// tabela mais antiga ou ainda sem a tabela do ano, #744). Erro próprio para o
// controller recusar com a mensagem legível, sem cair no 500 genérico.
export class TabelaFolhaAusenteError extends Error {
  constructor(chave) {
    const [ano, mes] = chave.split("-");
    super(`Sem tabela INSS/IRRF cadastrada para ${mes}/${ano}`);
    this.name = "TabelaFolhaAusenteError";
    this.competencia = chave;
  }
}

// Resolve o conjunto de tabelas vigente para a competência (aceita "YYYY-MM" ou
// "YYYY-MM-DD"). Lança TabelaFolhaAusenteError se nenhuma vigência cobre a
// competência — falhar explícito é melhor do que aplicar a tabela errada em silêncio.
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
    throw new TabelaFolhaAusenteError(chave);
  }

  return vigente;
}

const ALIQUOTA_FGTS = 0.08;
const ALIQUOTA_DESCONTO_VT = 0.06;
const DIVISOR_HORA_EXTRA = 220;
const ADICIONAL_HORA_EXTRA = 1.5;

// Convenção do sistema: mês comercial de 30 dias (a falta já desconta salário ÷ 30).
// 30 dias_trabalhados = mês completo.
const DIAS_MES_COMERCIAL = 30;
// Teto de horas extras por dia: jornada de até 12 h (8 h + 4 h) da CLT art. 61 §2º,
// o limite mais alto que a lei admite. Acima disso é erro de digitação.
const MAX_HORAS_EXTRAS_POR_DIA = 4;

// Salário do mês, proporcional aos dias trabalhados (#744): admissão ou demissão no
// meio do mês recebe salário × dias ÷ 30. Usado no cálculo e no holerite, para os
// dois mostrarem o mesmo número.
export function calcularSalarioMes(salarioContratual, diasTrabalhados) {
  return arredondar((Number(salarioContratual) * Number(diasTrabalhados)) / DIAS_MES_COMERCIAL);
}

// As linhas antigas podem ter sido calculadas com o salário cheio, mesmo
// com dias parciais. A base persistida identifica qual valor entrou no cálculo.
function salarioGravadoParaSaida(calculo) {
  const contratual = Number(calculo.salario_bruto);
  const proporcional = calcularSalarioMes(contratual, calculo.dias_trabalhados ?? DIAS_MES_COMERCIAL);
  if (calculo.base_calculo == null || contratual === proporcional) return proporcional;

  const ajuste = Number(calculo.valor_horas_extras ?? 0) - Number(calculo.valor_faltas ?? 0);
  const base = Number(calculo.base_calculo);
  const difIntegral = Math.abs(base - (contratual + ajuste));
  const difProporcional = Math.abs(base - (proporcional + ajuste));
  // Horas extras e faltas foram gravadas com arredondamento de centavos.
  return arredondar(difIntegral) <= 0.01 && difIntegral < difProporcional ? contratual : proporcional;
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

// Teto salarial do INSS da competência: o `limite` da última faixa da tabela.
// Não confundir com `tetoContribuicao`, que é a contribuição do EMPREGADO no teto.
function tetoSalarialINSS(tabelaInss) {
  return tabelaInss.faixas[tabelaInss.faixas.length - 1].limite;
}

// Pró-labore de sócio (#741): o sócio é contribuinte individual a serviço de
// empresa. Alíquota de 20% (Lei 8.212/91, art. 21) com dedução de 9 pontos
// (art. 30, §4º) = 11%, descontada pela empresa (Lei 10.666/2003, art. 4º), sem
// faixas progressivas e limitada ao teto. Vale também para optante do Simples.
// Não é o plano simplificado (11% sobre o salário mínimo, GPS 1163), que é
// recolhimento por conta própria.
//
// Retorna o valor SEM arredondar, pelo mesmo motivo de calcularINSS: a base do
// IRRF usa a precisão cheia.
const ALIQUOTA_INSS_CONTRIBUINTE_INDIVIDUAL = 0.11;

export function calcularINSSContribuinteIndividual(baseCalculo, tabelaInss) {
  if (baseCalculo <= 0) return 0;
  return Math.min(baseCalculo, tetoSalarialINSS(tabelaInss)) * ALIQUOTA_INSS_CONTRIBUINTE_INDIVIDUAL;
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

  // Redução mensal: até o piso de isenção o imposto é integralmente zerado,
  // independentemente do que a tabela progressiva apuraria.
  if (reducaoMensal && baseCalculo <= reducaoMensal.isencaoAte) return 0;

  const baseIr = calcularBaseIR(dados, tabelaIrrf);
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
// Fórmula do líquido: salário do mês − faltas + horas_extras − INSS − IR − adiantamento − desconto_vt.
//
// `salario_bruto` é o salário CONTRATUAL. O salário do mês é proporcional a
// `dias_trabalhados` (calcularSalarioMes); hora extra e falta continuam sobre o
// contratual (valor da hora e do dia não muda com a admissão no meio do mês). O
// desconto de 6% do vale-transporte sai do salário do mês.
//
// Sócio (`categoria = "socio"`, #612/#741): o salario_bruto é o pró-labore, que
// não tem hora extra, falta nem vale-transporte da CLT. Os três saem 0 no cálculo
// (os valores brutos da planilha seguem gravados como vieram, para auditoria), o
// INSS é o do contribuinte individual e não há FGTS. A regra dos dias vale igual.
export function calcularFolhaFuncionario(linha, competencia) {
  const { inss: tabelaInss, irrf: tabelaIrrf } = resolverTabelaFolha(competencia);
  const categoria = linha.categoria === "socio" ? "socio" : "empregado";
  const socio = categoria === "socio";

  const salarioBruto = linha.salario_bruto;
  const salarioMes = calcularSalarioMes(salarioBruto, linha.dias_trabalhados);
  const valorHoraExtra = socio
    ? 0
    : (salarioBruto / DIVISOR_HORA_EXTRA) * ADICIONAL_HORA_EXTRA * linha.horas_extras;
  const valorFaltas = socio ? 0 : (salarioBruto / DIAS_MES_COMERCIAL) * linha.faltas;
  const descontoVt = !socio && linha.vale_transporte ? salarioMes * ALIQUOTA_DESCONTO_VT : 0;

  const baseCalculo = arredondar(salarioMes - valorFaltas + valorHoraExtra);

  const inssPreciso = socio
    ? calcularINSSContribuinteIndividual(baseCalculo, tabelaInss)
    : calcularINSS(baseCalculo, tabelaInss);
  const inss = arredondar(inssPreciso);
  const fgts = socio ? 0 : arredondar(baseCalculo * ALIQUOTA_FGTS);

  const dadosIrrf = {
    baseCalculo,
    inss: inssPreciso,
    numDependentes: linha.num_dependentes,
  };
  const baseIr = calcularBaseIR(dadosIrrf, tabelaIrrf);
  const ir = calcularIR(dadosIrrf, tabelaIrrf);

  const liquido = arredondar(baseCalculo - inss - ir - linha.adiantamento - descontoVt);

  return {
    empresa: linha.empresa,
    funcionario: linha.funcionario,
    cpf: linha.cpf,
    cargo: linha.cargo,
    cnpj_empresa: linha.cnpj_empresa ?? null,
    salario_bruto: salarioBruto,
    dias_trabalhados: linha.dias_trabalhados,
    horas_extras: linha.horas_extras,
    faltas: linha.faltas,
    adiantamento: linha.adiantamento,
    num_dependentes: linha.num_dependentes,
    vale_transporte: linha.vale_transporte,
    // Persistida em folha_calculos (migration 110): o holerite é gerado das linhas
    // gravadas e precisa saber que é pró-labore.
    categoria,
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

// "5.000,00": valor com milhar, para mensagem de erro lida pelo contador.
function formatarValorMensagem(valor) {
  return Number(valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Motivo de um líquido negativo. Quando o adiantamento sozinho é o que passa do
// líquido, a mensagem diz isso; senão, os descontos fixos já passam dos proventos.
function motivoLiquidoNegativo(calculo) {
  const adiantamento = Number(calculo.adiantamento);
  const liquidoSemAdiantamento = arredondar(calculo.liquido + adiantamento);
  if (adiantamento > 0 && liquidoSemAdiantamento >= 0) {
    return `adiantamento de ${formatarValorMensagem(adiantamento)} maior que o líquido de ${formatarValorMensagem(liquidoSemAdiantamento)}`;
  }
  return `líquido negativo de ${formatarValorMensagem(calculo.liquido)}: os descontos passam dos proventos`;
}

// Calcula a folha de todas as linhas lidas da planilha (#744). Líquido negativo é
// erro de linha no mesmo formato de lerLinhasPlanilha ({ linha, motivos }) e recusa
// o processamento inteiro: se houver erro, `calculos` vem vazio (sem persistência
// parcial). Líquido zero é aceito.
export function calcularFolhaLinhas(linhas, competencia) {
  const calculos = [];
  const erros = [];

  for (const linha of linhas) {
    const calculo = calcularFolhaFuncionario(linha, competencia);
    if (calculo.liquido < 0) {
      erros.push({ linha: linha.linha ?? null, motivos: [motivoLiquidoNegativo(calculo)] });
    } else {
      calculos.push(calculo);
    }
  }

  return erros.length > 0 ? { calculos: [], erros } : { calculos, erros };
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

const formatarNumeroMensagem = (numero) => String(numero).replace(".", ",");

// Faixas de valor de uma linha já convertida (#744). Só confere o campo que passou
// na checagem de formato (`numeroValido`), para não repetir motivo; faltas e horas
// extras dependem de dias_trabalhados válido.
function validarFaixasLinha(linha, numeroValido) {
  const motivos = [];
  const { dias_trabalhados: dias, faltas, horas_extras: horasExtras } = linha;

  const diasValido = numeroValido.has("dias_trabalhados")
    && Number.isInteger(dias) && dias >= 1 && dias <= DIAS_MES_COMERCIAL;
  if (numeroValido.has("dias_trabalhados") && !diasValido) {
    motivos.push(
      `dias_trabalhados deve ser um número inteiro de 1 a ${DIAS_MES_COMERCIAL} (${DIAS_MES_COMERCIAL} = mês completo); recebido ${formatarNumeroMensagem(dias)}`,
    );
  }

  if (diasValido && numeroValido.has("faltas") && faltas > dias) {
    motivos.push(
      `faltas (${formatarNumeroMensagem(faltas)}) maior que dias_trabalhados (${dias})`,
    );
  }

  const limiteHorasExtras = dias * MAX_HORAS_EXTRAS_POR_DIA;
  if (diasValido && numeroValido.has("horas_extras") && horasExtras > limiteHorasExtras) {
    motivos.push(
      `horas_extras (${formatarNumeroMensagem(horasExtras)}) acima do limite de ${limiteHorasExtras} para ${dias} dias trabalhados (até ${MAX_HORAS_EXTRAS_POR_DIA} h por dia, CLT art. 61)`,
    );
  }

  if (numeroValido.has("num_dependentes") && !Number.isInteger(linha.num_dependentes)) {
    motivos.push(
      `num_dependentes deve ser um número inteiro; recebido ${formatarNumeroMensagem(linha.num_dependentes)}`,
    );
  }

  return motivos;
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
  let indiceCategoria = null;
  let indiceCnpj = null;
  sheetInicial.getRow(1).eachCell((cell, indiceColuna) => {
    if (typeof cell.value !== "string") return;
    const header = cell.value.trim().toLowerCase();
    if (header === COLUNA_CATEGORIA.header) indiceCategoria = indiceColuna;
    if (header === COLUNA_CNPJ.header) indiceCnpj = indiceColuna;
    const chave = headerPorNome.get(header);
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

    const numeroValido = new Set();
    CAMPOS_NUMERICOS.forEach((campo) => {
      const numero = paraNumero(bruta[campo]);
      if (Number.isNaN(numero) || numero < 0) {
        errosDaLinha.push(`${campo} deve ser um número não-negativo`);
      } else {
        numeroValido.add(campo);
      }
      linhaConvertida[campo] = numero;
    });

    if (numeroValido.has("salario_bruto") && linhaConvertida.salario_bruto <= 0) {
      errosDaLinha.push("salario_bruto deve ser maior que zero");
    }

    errosDaLinha.push(...validarFaixasLinha(linhaConvertida, numeroValido));

    const vt = paraBooleano(bruta.vale_transporte);
    if (!vt.ok) {
      errosDaLinha.push(
        `vale_transporte inválido; valores aceitos: ${VALORES_VT_ACEITOS}`,
      );
      linhaConvertida.vale_transporte = false;
    } else {
      linhaConvertida.vale_transporte = vt.valor;
    }

    const categoriaBruta = indiceCategoria == null
      ? null
      : desembrulharValorCelula(linhaExcel.getCell(indiceCategoria).value);
    if (categoriaBruta === null || categoriaBruta === undefined || String(categoriaBruta).trim() === "") {
      linhaConvertida.categoria = "empregado";
    } else {
      const categoria = CATEGORIA_POR_TEXTO.get(String(categoriaBruta).trim().toLowerCase());
      if (categoria) {
        linhaConvertida.categoria = categoria;
      } else {
        errosDaLinha.push(`categoria inválida; valores aceitos: ${CATEGORIAS_ACEITAS}`);
        linhaConvertida.categoria = "empregado";
      }
    }

    linhaConvertida.cnpj_empresa = null;
    const cnpjBruto = indiceCnpj == null
      ? null
      : desembrulharValorCelula(linhaExcel.getCell(indiceCnpj).value);
    if (cnpjBruto !== null && cnpjBruto !== undefined && String(cnpjBruto).trim() !== "") {
      // Célula numérica perde o zero à esquerda: o DV confere o CNPJ de qualquer forma.
      const digitos = typeof cnpjBruto === "number"
        ? String(Math.trunc(cnpjBruto)).padStart(14, "0")
        : String(cnpjBruto).replace(/\D/g, "");
      if (cnpjValido(digitos)) {
        linhaConvertida.cnpj_empresa = digitos;
      } else {
        errosDaLinha.push("cnpj_empresa inválido (14 dígitos com dígito verificador correto)");
      }
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

  // CNPJ por empresa: uma empresa não pode ter dois CNPJs na mesma planilha; linha da
  // empresa sem CNPJ herda o das outras linhas dela.
  const cnpjsPorEmpresa = new Map();
  for (const linha of linhas) {
    if (!linha.cnpj_empresa) continue;
    const chaveEmpresa = normalizarNomeEmpresa(linha.empresa);
    const conhecidos = cnpjsPorEmpresa.get(chaveEmpresa) ?? new Set();
    conhecidos.add(linha.cnpj_empresa);
    cnpjsPorEmpresa.set(chaveEmpresa, conhecidos);
  }
  for (const linha of linhas) {
    const conhecidos = cnpjsPorEmpresa.get(normalizarNomeEmpresa(linha.empresa));
    if (!conhecidos) continue;
    if (conhecidos.size > 1) {
      erros.push({
        linha: linha.linha,
        motivos: [`empresa '${linha.empresa}' com mais de um cnpj_empresa na planilha`],
      });
    } else if (!linha.cnpj_empresa) {
      linha.cnpj_empresa = [...conhecidos][0];
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

// Validação de faixa nas células de dado do modelo (#744): o Excel avisa na hora da
// digitação as mesmas regras que lerLinhasPlanilha confere no servidor. Não substitui
// a validação do servidor (colar valores passa por cima da validação do Excel).
function aplicarValidacoesFaixa(linha, indiceColuna) {
  const celula = (chave) => linha.getCell(indiceColuna(chave));
  const dias = celula("dias_trabalhados").address;
  const validar = (chave, regra, titulo, erro) => {
    celula(chave).dataValidation = {
      allowBlank: true,
      showErrorMessage: true,
      errorTitle: titulo,
      error: erro,
      ...regra,
    };
  };

  validar("salario_bruto", { type: "decimal", operator: "greaterThan", formulae: [0] },
    "Salário", "Salário contratual do mês completo, maior que zero.");
  validar("dias_trabalhados", { type: "whole", operator: "between", formulae: [1, DIAS_MES_COMERCIAL] },
    "Dias trabalhados", `Inteiro de 1 a ${DIAS_MES_COMERCIAL} (${DIAS_MES_COMERCIAL} = mês completo).`);
  validar("faltas", { type: "custom", formulae: [`AND(${celula("faltas").address}>=0,${celula("faltas").address}<=${dias})`] },
    "Faltas", "Faltas de 0 até os dias trabalhados.");
  validar("horas_extras", {
    type: "custom",
    formulae: [`AND(${celula("horas_extras").address}>=0,${celula("horas_extras").address}<=${MAX_HORAS_EXTRAS_POR_DIA}*${dias})`],
  }, "Horas extras", `Até ${MAX_HORAS_EXTRAS_POR_DIA} h por dia trabalhado (CLT art. 61).`);
  validar("adiantamento", { type: "decimal", operator: "greaterThanOrEqual", formulae: [0] },
    "Adiantamento", "Adiantamento não pode ser negativo.");
  validar("num_dependentes", { type: "whole", operator: "greaterThanOrEqual", formulae: [0] },
    "Dependentes", "Número inteiro de dependentes, 0 ou mais.");
}

// Gera o .xlsx modelo: cabeçalho travado (estrutura/ordem das colunas protegida)
// e células de dado destravadas, pra usuário preencher sem mexer nas colunas.
export async function gerarTemplateFolha() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Folha de Pagamento");

  const colunasTemplate = [...COLUNAS_FOLHA, COLUNA_CATEGORIA, COLUNA_CNPJ];
  sheet.columns = colunasTemplate;

  const linhaCabecalho = sheet.getRow(1);
  linhaCabecalho.font = { bold: true };
  linhaCabecalho.eachCell((cell) => {
    cell.protection = { locked: true };
  });

  const indiceColuna = (chave) => COLUNAS_FOLHA.findIndex((c) => c.key === chave) + 1;
  linhaCabecalho.getCell(indiceColuna("dias_trabalhados")).note =
    `Dias trabalhados no mês, inteiro de 1 a ${DIAS_MES_COMERCIAL} (${DIAS_MES_COMERCIAL} = mês completo). ` +
    "O salário do mês sai proporcional: salario_bruto × dias ÷ 30. " +
    "Não desconte as faltas aqui: falta vai na coluna faltas.";

  for (let numeroLinha = 2; numeroLinha <= LINHAS_DE_DADOS + 1; numeroLinha++) {
    const linha = sheet.getRow(numeroLinha);
    colunasTemplate.forEach((_, indice) => {
      linha.getCell(indice + 1).protection = { locked: false };
    });

    aplicarValidacoesFaixa(linha, indiceColuna);

    linha.getCell(COLUNAS_FOLHA.length + 1).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"EMPREGADO,SOCIO"'],
      showErrorMessage: true,
      errorTitle: "Categoria",
      error: "Use EMPREGADO ou SOCIO (sócio com pró-labore). Vazio = EMPREGADO.",
    };

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
export const MOTIVO_NAO_XLSX = "arquivo não é uma planilha .xlsx válida";
export const MOTIVO_SEM_LINHAS = "Planilha não tem nenhuma linha de dado preenchida";

// `motivo` só vem quando o problema não é "coluna faltando" (arquivo inválido, planilha vazia).
export async function validarColunasPlanilha(buffer) {
  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.load(buffer);
  } catch {
    return { valido: false, faltando: [], motivo: MOTIVO_NAO_XLSX };
  }

  const sheet = workbook.worksheets[0];

  if (!sheet) {
    return { valido: false, faltando: [], motivo: MOTIVO_NAO_XLSX };
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

  if (faltando.length > 0) {
    return { valido: false, faltando };
  }

  // Modelo baixado e enviado sem preencher: recusa já no upload, em vez de virar
  // "1 linha(s) inválida(s)" no pipeline (o template tem linhas formatadas mas sem valor).
  let temLinhaDeDado = false;
  sheet.eachRow((linha, numeroLinha) => {
    if (numeroLinha > 1 && linha.hasValues) temLinhaDeDado = true;
  });

  if (!temLinhaDeDado) {
    return { valido: false, faltando: [], motivo: MOTIVO_SEM_LINHAS };
  }

  return { valido: true, faltando: [] };
}

const FORMATO_DECIMAL_BR = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// 6000 -> "6.000,00" (milhar com ponto, centavos com vírgula).
export function formatarDecimalBR(valor) {
  return FORMATO_DECIMAL_BR.format(Number(valor));
}

// 10003167690 -> "100.031.676-90". Valor que não tem 11 dígitos sai como veio.
export function mascararCpf(cpf) {
  const digitos = String(cpf ?? "").replace(/\D/g, "");
  if (digitos.length !== 11) return String(cpf ?? "");
  return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`;
}

// 11222333000181 -> "11.222.333/0001-81".
export function mascararCnpj(cnpj) {
  const digitos = String(cnpj ?? "").replace(/\D/g, "");
  if (digitos.length !== 14) return String(cnpj ?? "");
  return `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5, 8)}/${digitos.slice(8, 12)}-${digitos.slice(12)}`;
}

// Referência de hora extra/falta: 2.5 -> "2,5".
export function formatarReferencia(valor) {
  return String(valor).replace(".", ",");
}

// Nome de empresa comparável: sem acento, caixa e espaços repetidos.
export function normalizarNomeEmpresa(nome) {
  return String(nome ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// CNPJ do empregador de cada empresa da planilha: o da própria planilha (cnpj_empresa);
// sem ele, o do cadastro do cliente SÓ quando o nome da empresa bate com o do cadastro
// (vínculo verificável). Planilha com uma empresa só não prova que ela é a cadastrada: o
// escritório pode processar a folha de outra empresa. Sem vínculo, null (sai "CNPJ não informado").
export function resolverCnpjsEmpresas(calculos, cliente) {
  const porEmpresa = new Map();
  for (const calculo of calculos) {
    if (!porEmpresa.has(calculo.empresa)) porEmpresa.set(calculo.empresa, null);
    if (calculo.cnpj_empresa) porEmpresa.set(calculo.empresa, calculo.cnpj_empresa);
  }
  const cnpjCadastro = cliente?.cnpj && /^\d{14}$/.test(cliente.cnpj) ? cliente.cnpj : null;
  for (const [empresa, cnpj] of porEmpresa) {
    if (cnpj || !cnpjCadastro) continue;
    if (normalizarNomeEmpresa(empresa) === normalizarNomeEmpresa(cliente.nome)) {
      porEmpresa.set(empresa, cnpjCadastro);
    }
  }
  return porEmpresa;
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
// sem adiantamento) são omitidas em vez de aparecer zeradas. HE e faltas entram pelo
// valor CALCULADO, não pelo bruto da planilha: no pró-labore de sócio os brutos
// ficam gravados, mas o cálculo os ignora (#741).
//
// `competencia` ("YYYY-MM" ou "YYYY-MM-DD") só é usada no sócio, para limitar a
// referência do INSS ao teto da época.
export function montarLinhasVerbas(calculo, competencia) {
  const socio = calculo.categoria === "socio";
  const linhas = [
    {
      verba: "0001",
      descricao: socio ? "PRO-LABORE" : "SALARIO BASE",
      // Referência = dias; provento = salário do mês (#744): 15 dias → metade.
      referencia: String(calculo.dias_trabalhados),
      proventos: formatarDecimalBR(salarioGravadoParaSaida(calculo)),
      descontos: "",
    },
  ];

  if (Number(calculo.valor_horas_extras) > 0) {
    linhas.push({
      verba: "0002",
      descricao: "HORAS EXTRAS 50%",
      referencia: formatarReferencia(calculo.horas_extras),
      proventos: formatarDecimalBR(calculo.valor_horas_extras),
      descontos: "",
    });
  }

  if (Number(calculo.valor_faltas) > 0) {
    linhas.push({
      verba: "0010",
      descricao: "FALTAS",
      referencia: formatarReferencia(calculo.faltas),
      proventos: "",
      descontos: formatarDecimalBR(calculo.valor_faltas),
    });
  }

  linhas.push(socio
    ? {
      verba: "0011",
      descricao: "INSS CONTRIB. INDIVIDUAL 11%",
      referencia: formatarDecimalBR(Math.min(
        Number(calculo.base_calculo),
        tetoSalarialINSS(resolverTabelaFolha(competencia).inss),
      )),
      proventos: "",
      descontos: formatarDecimalBR(calculo.inss),
    }
    : {
      verba: "0011",
      descricao: "INSS",
      referencia: formatarDecimalBR(calculo.base_calculo),
      proventos: "",
      descontos: formatarDecimalBR(calculo.inss),
    });

  linhas.push({
    verba: "0012",
    descricao: "IRRF",
    referencia: "",
    proventos: "",
    descontos: formatarDecimalBR(calculo.ir),
  });

  if (Number(calculo.adiantamento) > 0) {
    linhas.push({
      verba: "0013",
      descricao: "ADIANTAMENTO SALARIAL",
      referencia: "",
      proventos: "",
      descontos: formatarDecimalBR(calculo.adiantamento),
    });
  }

  if (calculo.vale_transporte && Number(calculo.desconto_vt) > 0) {
    linhas.push({
      verba: "0014",
      descricao: "VALE-TRANSPORTE (6%)",
      referencia: "",
      proventos: "",
      descontos: formatarDecimalBR(calculo.desconto_vt),
    });
  }

  return linhas;
}

// Linha de bases/totais do rodapé do holerite. BASE FGTS reaproveita base_calculo
// (não existe base de FGTS isolada persistida); linha sem FGTS (pró-labore de
// sócio, #612) mostra base 0. BASE IRRF usa a base_ir realmente calculada e
// persistida em folha_calculos; só cai para "-" quando não há imposto retido
// (IRRF genuinamente 0) ou quando a base não foi persistida — caso de linhas
// anteriores à migration 89.sql, onde exibir "0,00" seria um número falso.
// SALAR. BASE mostra o salário contratual; o total de proventos usa o salário do
// mês, o mesmo da linha SALARIO BASE da tabela de verbas (#744).
export function montarCelulasBases(calculo) {
  const totalProventos =
    salarioGravadoParaSaida(calculo) + Number(calculo.valor_horas_extras);
  const totalDescontos =
    Number(calculo.inss) + Number(calculo.ir) + Number(calculo.valor_faltas) +
    Number(calculo.adiantamento) + Number(calculo.desconto_vt);

  const baseIrDisponivel = calculo.base_ir != null && Number.isFinite(Number(calculo.base_ir));

  return [
    {
      rotulo: calculo.categoria === "socio" ? "PRÓ-LABORE" : "SALAR. BASE",
      texto: formatarDecimalBR(calculo.salario_bruto),
    },
    { rotulo: "SAL. CONTR.", texto: formatarDecimalBR(calculo.base_calculo) },
    { rotulo: "BASE FGTS", texto: formatarDecimalBR(Number(calculo.fgts) > 0 ? calculo.base_calculo : 0) },
    { rotulo: "FGTS MES", texto: formatarDecimalBR(calculo.fgts) },
    { rotulo: "BASE IRRF", texto: baseIrDisponivel ? formatarDecimalBR(calculo.base_ir) : "-" },
    { rotulo: "DEP IR", texto: String(calculo.num_dependentes) },
    { rotulo: "TOT. PROVENTOS", texto: formatarDecimalBR(totalProventos) },
    { rotulo: "TOT. DESCONTOS", texto: formatarDecimalBR(totalDescontos) },
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
// `competencia` (mes_referencia do processamento) só é exigida no holerite de sócio
// (ver montarLinhasVerbas).
export function gerarHoleritePDF(calculo, mesReferenciaFormatado, competencia) {
  const cnpjEmpresa = calculo.cnpj_empresa ?? null;
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
      .text(calculo.empresa, x0 + 6, y + 6, { width: larguraUtil * 0.6 });
    doc.font("Helvetica").fontSize(8)
      .text(cnpjEmpresa ? `CNPJ: ${mascararCnpj(cnpjEmpresa)}` : "CNPJ não informado", x0 + 6, y + 22, {
        width: larguraUtil * 0.6,
      });
    doc.font("Helvetica").fontSize(9)
      .text(`Referência: ${mesReferenciaFormatado}`, x0 + larguraUtil * 0.6, y + 10, {
        width: larguraUtil * 0.4 - 6,
        align: "right",
      });
    y += 36;
    doc.moveTo(x0, y).lineTo(x0 + larguraUtil, y).stroke();

    const alturaInfo = 24;
    desenharLinhaCelulas(doc, x0, y, alturaInfo, [
      { largura: larguraUtil * 0.4, rotulo: "TRABALHADOR", texto: calculo.funcionario },
      { largura: larguraUtil * 0.2, rotulo: "CPF", texto: mascararCpf(calculo.cpf) },
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

    montarLinhasVerbas(calculo, competencia).forEach((linha) => {
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

    desenharCelula(doc, x0, y, larguraUtil, alturaTotalLiquido, `R$ ${formatarDecimalBR(calculo.liquido)}`, {
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
  // Proventos (salário + horas extras) menos descontos do empregado dá o líquido GRAVADO, linha
  // a linha. Os descontos de cada linha são proventos − líquido: o motor arredonda a base depois
  // de combinar salário, faltas e HE, então somar as rubricas já arredondadas pode errar 1
  // centavo (ex.: 3.000,09 + 2,5 h extras − 1 falta). O centavo de arredondamento fica no
  // desconto e o fechamento bate com o líquido de cada holerite. O FGTS é encargo do
  // empregador, fora dessa conta (#745).
  return calculosDaEmpresa.reduce((acc, calculo) => {
    const proventos = salarioGravadoParaSaida(calculo) + Number(calculo.valor_horas_extras ?? 0);
    return {
      totalFuncionarios: acc.totalFuncionarios + 1,
      totalProventos: arredondar(acc.totalProventos + proventos),
      totalDescontos: arredondar(acc.totalDescontos + (proventos - Number(calculo.liquido))),
      totalFgts: arredondar(acc.totalFgts + Number(calculo.fgts)),
      totalLiquido: arredondar(acc.totalLiquido + Number(calculo.liquido)),
    };
  }, { totalFuncionarios: 0, totalProventos: 0, totalDescontos: 0, totalFgts: 0, totalLiquido: 0 });
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
export function gerarRelatorioFechamentoPDF({ empresa, cnpjEmpresa = null, mesReferenciaFormatado, calculos, totais }) {
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
      .text(empresa, x0 + 6, y + 6, { width: larguraUtil * 0.6 });
    doc.font("Helvetica").fontSize(8)
      .text(cnpjEmpresa ? `CNPJ: ${mascararCnpj(cnpjEmpresa)}` : "CNPJ não informado", x0 + 6, y + 22, {
        width: larguraUtil * 0.6,
      });
    doc.font("Helvetica").fontSize(9)
      .text(`Referência: ${mesReferenciaFormatado}`, x0 + larguraUtil * 0.6, y + 10, {
        width: larguraUtil * 0.4 - 6,
        align: "right",
      });
    y += 36;
    doc.moveTo(x0, y).lineTo(x0 + larguraUtil, y).stroke();

    // Proventos − descontos do empregado = líquido; o FGTS é encargo do empregador, à parte.
    const alturaTotais = 26;
    const larguraCelulaTotal = larguraUtil / 5;
    desenharLinhaCelulas(doc, x0, y, alturaTotais, [
      { largura: larguraCelulaTotal, rotulo: "FUNCIONÁRIOS", texto: String(totais.totalFuncionarios), alinhamento: "right" },
      { largura: larguraCelulaTotal, rotulo: "TOTAL PROVENTOS", texto: formatarDecimalBR(totais.totalProventos), alinhamento: "right" },
      { largura: larguraCelulaTotal, rotulo: "TOTAL DESCONTOS", texto: formatarDecimalBR(totais.totalDescontos), alinhamento: "right" },
      { largura: larguraCelulaTotal, rotulo: "TOTAL LÍQUIDO", texto: formatarDecimalBR(totais.totalLiquido), alinhamento: "right", negrito: true },
      { largura: larguraCelulaTotal, rotulo: "FGTS (EMPREGADOR)", texto: formatarDecimalBR(totais.totalFgts), alinhamento: "right" },
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
        liquido: formatarDecimalBR(calculo.liquido),
      });
      y += alturaLinha;
    });
    fecharSegmentoTabelaVerbas(doc, x0, yTabelaTopo, y, colunasFuncionarios);

    if (!houvePaginacao) {
      doc.lineWidth(0.8).rect(x0, yInicio, larguraUtil, y - yInicio).stroke();
    }
  });
}
