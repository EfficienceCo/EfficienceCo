// Tabelas de domínio do leiaute S-1.3 do eSocial usadas pelo formulário do
// S-2200 (#ES-10). Cada lista vira <option> no wizard. Não é a fonte da verdade
// do schema — o XSD oficial é — mas cobre os códigos correntes de cada campo do
// gerador `gerarXmlS2200` (backend/src/utils/esocial-xml.util.js).
//
// Também expõe validadores client-side que ESPELHAM as regras do gerador, para
// o usuário ver o erro antes do submit (o backend revalida e devolve 422).

// --- Trabalhador ----------------------------------------------------------

export const SEXO = [
  { value: 'M', label: 'Masculino' },
  { value: 'F', label: 'Feminino' },
];

// Tabela 12 — Raça e cor.
export const RACA_COR = [
  { value: '1', label: '1 — Branca' },
  { value: '2', label: '2 — Preta' },
  { value: '3', label: '3 — Parda' },
  { value: '4', label: '4 — Amarela' },
  { value: '5', label: '5 — Indígena' },
  { value: '6', label: '6 — Não informado' },
];

// Tabela 13 — Grau de instrução.
export const GRAU_INSTRUCAO = [
  { value: '01', label: '01 — Analfabeto' },
  { value: '02', label: '02 — Até o 5º ano incompleto do fundamental' },
  { value: '03', label: '03 — 5º ano completo do fundamental' },
  { value: '04', label: '04 — 6º ao 9º ano do fundamental incompleto' },
  { value: '05', label: '05 — Ensino fundamental completo' },
  { value: '06', label: '06 — Ensino médio incompleto' },
  { value: '07', label: '07 — Ensino médio completo' },
  { value: '08', label: '08 — Educação superior incompleta' },
  { value: '09', label: '09 — Educação superior completa' },
  { value: '10', label: '10 — Pós-graduação / especialização (lato sensu)' },
  { value: '11', label: '11 — Mestrado' },
  { value: '12', label: '12 — Doutorado' },
];

export const ESTADO_CIVIL = [
  { value: '1', label: '1 — Solteiro(a)' },
  { value: '2', label: '2 — Casado(a)' },
  { value: '3', label: '3 — Divorciado(a)' },
  { value: '4', label: '4 — Separado(a) judicialmente' },
  { value: '5', label: '5 — Viúvo(a)' },
];

export const PAISES = [
  { value: '105', label: '105 — Brasil' },
  { value: '063', label: '063 — Argentina' },
  { value: '111', label: '111 — Chile' },
  { value: '178', label: '178 — Estados Unidos' },
  { value: '341', label: '341 — Portugal' },
  { value: '640', label: '640 — Paraguai' },
  { value: '845', label: '845 — Uruguai' },
];

// --- Vínculo ------------------------------------------------------------

export const TP_INSC = [
  { value: '1', label: '1 — CNPJ' },
  { value: '2', label: '2 — CPF' },
  { value: '3', label: '3 — CAEPF' },
  { value: '4', label: '4 — CNO' },
];

export const TP_REG_TRAB = [
  { value: '1', label: '1 — Trabalhador CLT (celetista)' },
  { value: '2', label: '2 — Estatutário' },
];

export const TP_REG_PREV = [
  { value: '1', label: '1 — RGPS — Regime Geral de Previdência Social' },
  { value: '2', label: '2 — RPPS — Regime Próprio de Previdência Social' },
  { value: '3', label: '3 — RPPE — Regime de Previdência no Exterior' },
];

// Tabela 1 — Categorias de trabalhador aceitas pelo S-2200 (leiaute S-1.3).
// `estatutaria: true` obriga tpRegTrab = 2 (o gerador rejeita divergência).
export const CATEGORIAS_S2200 = [
  { value: '101', label: '101 — Empregado geral (inclusive doméstico e trab. rural por pequeno prazo)', estatutaria: false },
  { value: '102', label: '102 — Empregado — trabalhador rural por pequeno prazo (Lei 11.718/2008)', estatutaria: false },
  { value: '103', label: '103 — Empregado — aprendiz', estatutaria: false },
  { value: '104', label: '104 — Empregado — contrato a termo firmado por lei específica', estatutaria: false },
  { value: '105', label: '105 — Empregado — contrato de trabalho intermitente', estatutaria: false },
  { value: '106', label: '106 — Trabalhador temporário (Lei 6.019/1974)', estatutaria: false },
  { value: '107', label: '107 — Empregado — cargo eletivo (RGPS)', estatutaria: false },
  { value: '108', label: '108 — Empregado — cargo eletivo (outros regimes)', estatutaria: false },
  { value: '111', label: '111 — Empregado — contrato de trabalho verde e amarelo', estatutaria: false },
  { value: '301', label: '301 — Servidor público titular de cargo efetivo / vitalício', estatutaria: true },
  { value: '302', label: '302 — Servidor público ocupante de cargo exclusivo em comissão', estatutaria: true },
  { value: '303', label: '303 — Exercente de mandato eletivo', estatutaria: true },
  { value: '306', label: '306 — Servidor público indicado para conselho ou órgão deliberativo', estatutaria: true },
  { value: '307', label: '307 — Militar', estatutaria: true },
  { value: '309', label: '309 — Agente público — outros', estatutaria: true },
  { value: '310', label: '310 — Servidor público contratado por tempo determinado', estatutaria: true },
  { value: '312', label: '312 — Servidor público titular de cargo efetivo (magistério)', estatutaria: true },
  { value: '314', label: '314 — Servidor público — demais agentes públicos', estatutaria: true },
];

export const CATEGORIAS_ESTATUTARIAS = new Set(
  CATEGORIAS_S2200.filter((c) => c.estatutaria).map((c) => c.value),
);

// --- Regime celetista (infoCeletista) ---------------------------------

// Tabela 2 — Tipos de admissão.
export const TP_ADMISSAO = [
  { value: '1', label: '1 — Admissão' },
  { value: '2', label: '2 — Transferência de empresa do mesmo grupo econômico' },
  { value: '3', label: '3 — Transferência de empresa consorciada ou de consórcio' },
  { value: '4', label: '4 — Transferência por motivo de sucessão, incorporação, cisão ou fusão' },
  { value: '5', label: '5 — Transferência do empregado doméstico para outro representante da mesma unidade familiar' },
  { value: '6', label: '6 — Mudança de CPF' },
];

export const IND_ADMISSAO = [
  { value: '1', label: '1 — Normal' },
  { value: '2', label: '2 — Decorrente de ação fiscal' },
  { value: '3', label: '3 — Decorrente de decisão judicial' },
];

// Tabela 24 — Tipos de regime de jornada.
export const TP_REG_JOR = [
  { value: '1', label: '1 — Submetido a horário de trabalho (art. 58 da CLT)' },
  { value: '2', label: '2 — Atividade externa incompatível com horário (art. 62, I, da CLT)' },
  { value: '3', label: '3 — Funções especificadas no art. 62, II, da CLT' },
  { value: '4', label: '4 — Teletrabalho (art. 62, III, da CLT)' },
];

export const NAT_ATIVIDADE = [
  { value: '1', label: '1 — Trabalho urbano' },
  { value: '2', label: '2 — Trabalho rural' },
];

export const IND_APRENDIZ = [
  { value: '1', label: '1 — Contratação direta pelo estabelecimento cumpridor da cota' },
  { value: '2', label: '2 — Contratação de aprendiz por entidade sem fins lucrativos' },
  { value: '3', label: '3 — Contratação de aprendiz por instituição de ensino técnico / SNA' },
];

// --- Regime estatutário (infoEstatutario) ----------------------------

export const TP_PROVIMENTO = [
  { value: '1', label: '1 — Nomeação em cargo ou emprego efetivo / vitalício' },
  { value: '2', label: '2 — Nomeação exclusiva em cargo em comissão' },
  { value: '3', label: '3 — Nomeação em emprego permanente de forma não efetiva' },
  { value: '4', label: '4 — Nomeação decorrente de aprovação em concurso público' },
  { value: '5', label: '5 — Contratação por tempo determinado' },
  { value: '6', label: '6 — Designação / dispensa de função ou cargo em comissão' },
  { value: '7', label: '7 — Exercício de mandato eletivo' },
  { value: '8', label: '8 — Exercício de mandato classista' },
];

export const TP_PLANO_RP = [
  { value: '1', label: '1 — RPPS' },
  { value: '2', label: '2 — Previdência complementar (regime de previdência complementar)' },
];

// --- infoContrato -----------------------------------------------------

// Tabela 5 — Unidade de pagamento da parte fixa da remuneração.
export const UNIDADE_SALARIO = [
  { value: '1', label: '1 — Por hora' },
  { value: '2', label: '2 — Por dia' },
  { value: '3', label: '3 — Por semana' },
  { value: '4', label: '4 — Por quinzena' },
  { value: '5', label: '5 — Por mês' },
  { value: '6', label: '6 — Por tarefa' },
  { value: '7', label: '7 — Não aplicável (salário exclusivamente variável)' },
];

export const TP_CONTRATO = [
  { value: '1', label: '1 — Prazo indeterminado' },
  { value: '2', label: '2 — Prazo determinado, com data definida para término' },
  { value: '3', label: '3 — Prazo determinado, vinculado à ocorrência de um fato' },
];

export const TP_JORNADA = [
  { value: '1', label: '1 — Jornada com horário diário e folga fixos' },
  { value: '2', label: '2 — Jornada 12 x 36 (12 de trabalho por 36 de descanso)' },
  { value: '3', label: '3 — Jornada com horário diário fixo e folga variável' },
  { value: '4', label: '4 — Jornada com horário diário fixo e variável (dias úteis e sábado)' },
  { value: '5', label: '5 — Jornada com horário diário e folga variáveis' },
  { value: '6', label: '6 — Demais tipos de jornada' },
];

export const TMP_PARCIAL = [
  { value: '0', label: '0 — Não é contrato em tempo parcial' },
  { value: '1', label: '1 — Tempo parcial — limitado a 25 horas semanais' },
  { value: '2', label: '2 — Tempo parcial — limitado a 30 horas semanais' },
  { value: '3', label: '3 — Tempo parcial — limitado a 26 horas semanais' },
];

// --- Dependentes (Tabela 14 — parcial) ------------------------------

export const TP_DEPENDENTE = [
  { value: '01', label: '01 — Cônjuge' },
  { value: '02', label: '02 — Companheiro(a) com filho(a) ou união estável há mais de 5 anos' },
  { value: '03', label: '03 — Filho(a) ou enteado(a)' },
  { value: '04', label: '04 — Filho(a)/enteado(a) universitário(a) ou em escola técnica (até 24 anos)' },
  { value: '06', label: '06 — Irmão(ã), neto(a) ou bisneto(a) com guarda judicial' },
  { value: '07', label: '07 — Pais, avós e bisavós' },
  { value: '09', label: '09 — Incapaz, do qual o contribuinte é tutor ou curador' },
  { value: '10', label: '10 — Ex-cônjuge / outros dependentes (pensão de alimentos)' },
  { value: '11', label: '11 — Agregado / outros' },
  { value: '12', label: '12 — Ex-cônjuge sem pensão de alimentos' },
  { value: '99', label: '99 — Dependente exclusivamente para fins previdenciários' },
];

// --- Afastamento (Tabela 18 — parcial) e desligamento (Tabela 19 — parcial) ---

export const MOTIVOS_AFASTAMENTO = [
  { value: '01', label: '01 — Acidente/doença do trabalho' },
  { value: '03', label: '03 — Acidente/doença não relacionada ao trabalho' },
  { value: '05', label: '05 — Afastamento/licença prevista em legislação, sem remuneração' },
  { value: '06', label: '06 — Aposentadoria por invalidez' },
  { value: '07', label: '07 — Acompanhamento de familiar enfermo' },
  { value: '11', label: '11 — Cárcere' },
  { value: '12', label: '12 — Cargo eletivo — candidato a cargo público' },
  { value: '14', label: '14 — Licença-maternidade' },
  { value: '15', label: '15 — Licença-maternidade — prorrogação (Empresa Cidadã)' },
  { value: '17', label: '17 — Licença-maternidade — adoção ou guarda judicial' },
  { value: '18', label: '18 — Licença não remunerada ou sem vencimento' },
];

export const MOTIVOS_DESLIGAMENTO = [
  { value: '02', label: '02 — Rescisão sem justa causa, por iniciativa do empregador' },
  { value: '03', label: '03 — Rescisão antecipada de contrato a termo, por iniciativa do empregador' },
  { value: '04', label: '04 — Rescisão por término do contrato a termo' },
  { value: '07', label: '07 — Rescisão por pedido de demissão do empregado' },
  { value: '08', label: '08 — Rescisão por falecimento do empregado' },
  { value: '10', label: '10 — Rescisão indireta (por iniciativa do empregado)' },
  { value: '11', label: '11 — Rescisão por acordo entre as partes (art. 484-A da CLT)' },
  { value: '12', label: '12 — Rescisão com justa causa, por iniciativa do empregador' },
  { value: '17', label: '17 — Rescisão por culpa recíproca' },
];

// Tipo de logradouro — campo livre curto (ex.: "R", "AV", "TV"). Sem tabela
// fechada no wizard.
export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE',
  'TO', 'EX',
];

export const SIM_NAO = [
  { value: 'S', label: 'Sim' },
  { value: 'N', label: 'Não' },
];

// --- Validadores client-side (espelham o gerador) ---------------------

export function soDigitos(valor) {
  return String(valor ?? '').replace(/\D+/g, '');
}

/**
 * CPF válido: 11 dígitos + dígitos verificadores. Espelha a checagem que o
 * eSocial faz no cpfTrab. Rejeita as sequências repetidas (000..., 111...).
 */
export function validarCpf(valor) {
  const cpf = soDigitos(valor);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const calcularDigito = (base, pesoInicial) => {
    let soma = 0;
    for (let i = 0; i < base.length; i += 1) {
      soma += Number(base[i]) * (pesoInicial - i);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  const digito1 = calcularDigito(cpf.slice(0, 9), 10);
  const digito2 = calcularDigito(cpf.slice(0, 10), 11);
  return digito1 === Number(cpf[9]) && digito2 === Number(cpf[10]);
}

/**
 * Data civil aceita pelo gerador: "dd/mm/aaaa" ou "aaaa-mm-dd", existente no
 * calendário. Mesma lógica de `formatarData` em esocial-xml.util.js.
 */
export function validarDataCivil(valor) {
  const texto = String(valor ?? '').trim();
  let ano;
  let mes;
  let dia;

  let match = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) [, ano, mes, dia] = match;
  else if ((match = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/))) [, dia, mes, ano] = match;
  else return false;

  const a = Number(ano);
  const m = Number(mes);
  const d = Number(dia);
  const ultimoDia = new Date(a, m, 0).getDate();
  return m >= 1 && m <= 12 && d >= 1 && d <= ultimoDia;
}

/**
 * Interpreta um valor monetário como o gerador (`formatarValor` em
 * esocial-xml.util.js): aceita "2500.00" (ponto decimal) e o formato pt-BR
 * "2.500,00". String sem vírgula com ponto seguido de != 2 dígitos é ambígua
 * ("2.500" = 2500 ou 2,5?) e devolve NaN, igual ao backend. Devolve NaN também
 * para entrada não numérica.
 */
export function parseValorMonetario(valor) {
  let s = String(valor ?? '')
    .trim()
    .replace(/^r\$\s*/i, '')
    .replace(/\s/g, '');
  if (!s) return NaN;
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes('.') && !/^\d+\.\d{1,2}$/.test(s)) {
    return NaN;
  }
  const numero = Number(s);
  return Number.isFinite(numero) ? numero : NaN;
}
