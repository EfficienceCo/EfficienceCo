// ---------------------------------------------------------------------------
// Gerador de XML de eventos do eSocial — leiaute S-1.3 (NT 06/2026).
//
// Escopo desta task (#375 / ES-6): implementar SÓ o S-2200 (Admissão), que é o
// evento mais complexo (40+ campos, o schema muda conforme a categoria do
// trabalhador). O objetivo é fixar o PADRÃO que os outros 11 eventos vão seguir.
// #648 adicionou S-2299 (Desligamento) e S-1200 (Remuneração) seguindo o padrão.
//
// -------------------------------------------------------------------------
// COMO ADICIONAR UM NOVO EVENTO (ex.: S-2206, S-2299, S-1200 ...)
// -------------------------------------------------------------------------
//   1. Escrever uma função `montarEvtXxxx(dados)` que devolve um objeto JS
//      puro com a árvore do evento na ORDEM do XSD (a ordem das chaves do
//      objeto vira a ordem das tags — o schema do eSocial é xs:sequence).
//   2. Registrar o evento em EVENTOS abaixo: código -> { raiz, xmlns, versao,
//      montar }. `raiz` é o nome do elemento do evento (ex.: 'evtAdmissao'),
//      `montar` é a função do passo 1.
//   3. Reaproveitar os helpers desta seção (soDigitos, formatarData,
//      gerarIdEvento, exigir, podarVazios, montarEnvelope) — NÃO duplicar
//      formatação de data/CPF nem montagem de envelope por evento.
//   4. Exportar um `gerarXmlSxxxx(...)` fino, no mesmo formato de
//      `gerarXmlS2200` (valida entrada -> monta objeto -> montarEnvelope).
//
// Os campos exatos de cada evento vêm do XSD oficial vigente
// (https://www.gov.br/esocial/pt-br/documentacao-tecnica) — este arquivo
// não é a fonte da verdade do schema, é a implementação do S-2200 contra ele.
//
// -------------------------------------------------------------------------
// VALIDAÇÃO
// -------------------------------------------------------------------------
// A validação contra o XSD é MANUAL (decisão de time): o XML gerado é
// conferido no ambiente de Produção Restrita do eSocial / validador offline.
// Nunca usar produção real durante o desenvolvimento. Os testes automatizados
// (tests/esocial-xml.util.test.js) cobrem estrutura, ordem de tags, campos
// obrigatórios e a variação por categoria — não substituem o XSD.
//
// CONFERIDO CONTRA O XSD OFICIAL S-1.3 (evtAdmissao.xsd / tipos.xsd,
// v_S_01_03_00), pacotes de 27/04 e 01/07/2026 do portal eSocial.
// Validação offline reproduzida em 2026-09-06 — ver
// docs/validacao-s2200-xsd.md (estrutura de XML, sem transmissão/assinatura real).
// ES-6 / QA-cleanup-4 (#406):
//   - <nascimento> no XSD só tem dtNascto/paisNascto/paisNac — NÃO existe
//     <codMunic>/<uf> (naturalidade) dentro do grupo. Corrigido: o código
//     emitia esses campos indevidamente (elemento fora do xs:sequence
//     rejeitado pela validação); removidos.
//   - <nmFuncao> vem antes de <CBOFuncao> em infoContrato — já estava certo.
//   - grupo <FGTS> só tem <dtOpcFGTS> (sem <opcFGTS> legado) — já estava
//     certo. Mas o CONDICAO_GRUPO do XSD mostrou que o grupo é PROIBIDO
//     (tpAdmissao=6, ou dtAdm >= 1988-10-05 [>= 2015-10-01 p/ doméstico,
//     codCateg 104]) e só OBRIGATÓRIO fora disso (admissão anterior à
//     obrigatoriedade do FGTS). Corrigido: código antes aceitava <FGTS>
//     sempre que informado, mesmo quando o XSD proíbe (praticamente toda
//     admissão atual cai nessa proibição).
//   - <horContratual> é minOccurs=0 (opcional) no XSD para os dois regimes;
//     a regra de negócio (obrigatório quando tpRegJor=1/celetista sem
//     desligamento) já estava implementada corretamente.
//   - a validação do documento completo também identificou indAdmissao e
//     cnpjSindCategProf obrigatórios em infoCeletista; agora são exigidos.
// ---------------------------------------------------------------------------

import { create } from "xmlbuilder2";
import { CATALOGO_ESOCIAL } from "./esocial-catalogo.util.js";
import { cpfValido, soDigitos } from "./comum.util.js";

export { soDigitos };

// Versão do leiaute usada na URN do namespace e em ideEvento/verProc.
// S-1.3 -> "S_01_03_00". Trocar aqui quando o governo publicar nova versão.
export const VERSAO_LEIAUTE = "S_01_03_00";

// tpAmb: 1 = Produção | 2 = Produção Restrita (homologação).
// Durante o desenvolvimento SEMPRE 2. ES-7 decide o valor real por cliente.
export const TP_AMB = { PRODUCAO: 1, HOMOLOGACAO: 2 };

// procEmi: 1 = aplicativo do empregador (é o nosso caso).
const PROC_EMI_APP_EMPREGADOR = 1;

// verProc: versão do software emissor. O XSD do eSocial limita a 1..20 chars.
const VER_PROC_PADRAO = "EfficienceCo-1.0";

// Categorias de trabalhador aceitas pelo S-2200 no leiaute S-1.3.
// Fora desta lista o evento correto é outro (ex.: estagiário/autônomo = S-2300,
// que é TSVE e vira uma task própria, não uma categoria do S-2200).
export const CATEGORIAS_S2200 = new Set([
  101, 102, 103, 104, 105, 106, 107, 108, 111,
  301, 302, 303, 306, 307, 309, 310, 312, 314,
]);

// Categorias de regime estatutário (usam infoEstatutario em vez de
// infoCeletista). As demais categorias do S-2200 são celetistas.
export const CATEGORIAS_ESTATUTARIAS = new Set([301, 302, 303, 306, 307, 309, 310, 312, 314]);
const TP_INSC_EMPREGADOR = new Set([1, 2]);
const TP_INSC_LOCAL_GERAL = new Set([1, 3, 4]);
const TP_INSC_ESTAB_VINC = new Set([1, 2]);
// Domínio aceito para horContratual.tpJornada. Precisa casar exatamente com
// TP_JORNADA de frontend/src/lib/esocial-tabelas.js — testado em
// backend/tests/esocial-tabelas-sync.test.js.
export const TP_JORNADA = new Set([2, 3, 4, 5, 6, 7, 9]);
const TMP_PARC = new Set([0, 1, 2, 3]);

// ---------------------------------------------------------------------------
// Erro de domínio — entrada inválida para geração de XML.
// ES-7 traduz isso para HTTP 422 (mesma convenção do motor de apuração).
// ---------------------------------------------------------------------------
export class ErroXmlESocial extends Error {
  constructor(mensagem, camposFaltando = []) {
    super(mensagem);
    this.name = "ErroXmlESocial";
    this.camposFaltando = camposFaltando;
  }
}

// ---------------------------------------------------------------------------
// Helpers reutilizáveis por TODOS os eventos
// ---------------------------------------------------------------------------

/**
 * Normaliza data para "AAAA-MM-DD" (formato de xs:date do eSocial).
 * Aceita "AAAA-MM-DD", "DD/MM/AAAA" e Date. Strings são casadas com âncora
 * nas duas pontas (não trunca lixo no fim) e o dia/mês são validados no
 * calendário — data impossível (ex.: 99/13/2026) lança, não vaza pro XML.
 *
 * Date é lido em UTC de propósito: `new Date("2026-08-01")` é meia-noite UTC,
 * e o backend roda em UTC (Railway). Para uma data civil sem hora, prefira
 * passar a string "AAAA-MM-DD"; para Date, use `new Date(Date.UTC(...))`.
 */
export function formatarData(valor) {
  if (valor === null || valor === undefined || valor === "") return "";
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) throw new ErroXmlESocial("Data inválida");
    const a = valor.getUTCFullYear();
    const m = String(valor.getUTCMonth() + 1).padStart(2, "0");
    const d = String(valor.getUTCDate()).padStart(2, "0");
    return `${a}-${m}-${d}`;
  }
  const texto = String(valor).trim();
  let ano;
  let mes;
  let dia;
  let match = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) [, ano, mes, dia] = match;
  else if ((match = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/))) [, dia, mes, ano] = match;
  else throw new ErroXmlESocial(`Data em formato não reconhecido: "${texto}"`);

  const a = Number(ano);
  const m = Number(mes);
  const d = Number(dia);
  const ultimoDia = new Date(Date.UTC(a, m, 0)).getUTCDate();
  if (m < 1 || m > 12 || d < 1 || d > ultimoDia) {
    throw new ErroXmlESocial(`Data inexistente no calendário: "${texto}"`);
  }
  return `${ano}-${mes}-${dia}`;
}

/** Normaliza competência para "AAAA-MM" (perApur dos eventos periódicos). */
export function formatarCompetencia(valor) {
  if (valor === null || valor === undefined || valor === "") {
    throw new ErroXmlESocial("Competência ausente");
  }
  const texto = String(valor).trim();
  const data = formatarData(/^\d{4}-\d{2}$/.test(texto) ? `${texto}-01` : texto);
  return data.slice(0, 7);
}

/**
 * "S" / "N" a partir de booleano OU das formas serializadas comuns
 * ("true"/"false", "S"/"N", "1"/"0", "sim"/"nao"). String ambígua lança —
 * não deixa `"false"` virar "S" silenciosamente.
 */
export function sn(valor) {
  if (valor === true) return "S";
  if (valor === false || valor === null || valor === undefined || valor === "") return "N";
  const t = String(valor).trim().toLowerCase();
  if (["s", "sim", "true", "1"].includes(t)) return "S";
  if (["n", "nao", "não", "false", "0"].includes(t)) return "N";
  throw new ErroXmlESocial(`Indicador S/N inválido: "${valor}"`);
}

/**
 * Regra de formação do Id do evento (36 caracteres):
 *   "ID" + tpInsc(1) + nrInsc(14) + AAAAMMDDHHMMSS(14) + sequencial(5)
 * nrInsc: se tpInsc=1 (CNPJ), usa as 8 primeiras posições (raiz) e completa
 * com zeros À DIREITA até 14; se tpInsc=2 (CPF), usa as 11 e completa até 14.
 * Tem que bater com <ideEmpregador><nrInsc>. sequencial vai com zeros à
 * esquerda (00001..99999).
 */
export function gerarIdEvento({ tpInsc, nrInsc, dataHora = new Date(), sequencial = 1 }) {
  validarDominio("tpInsc", tpInsc, TP_INSC_EMPREGADOR, "ideEmpregador");
  const digitos = soDigitos(nrInsc);
  const raiz = Number(tpInsc) === 1 ? digitos.slice(0, 8) : digitos.slice(0, 11);
  const insc = raiz.padEnd(14, "0").slice(0, 14);
  const seqNum = Number(sequencial);
  if (!Number.isInteger(seqNum) || seqNum < 1 || seqNum > 99999) {
    throw new ErroXmlESocial(`sequencial do Id deve ser inteiro de 1 a 99999 (recebido: ${sequencial})`);
  }
  const d = dataHora instanceof Date ? dataHora : new Date(dataHora);
  if (Number.isNaN(d.getTime())) throw new ErroXmlESocial("dataHora inválida para o Id do evento");
  // UTC (o backend roda em UTC). O timestamp do Id serve só para unicidade —
  // o eSocial não vincula fuso a ele.
  const ts =
    String(d.getUTCFullYear()).padStart(4, "0") +
    String(d.getUTCMonth() + 1).padStart(2, "0") +
    String(d.getUTCDate()).padStart(2, "0") +
    String(d.getUTCHours()).padStart(2, "0") +
    String(d.getUTCMinutes()).padStart(2, "0") +
    String(d.getUTCSeconds()).padStart(2, "0");
  const seq = String(seqNum).padStart(5, "0");
  return `ID${Number(tpInsc)}${insc}${ts}${seq}`;
}

/**
 * Garante que os campos existem e não estão vazios. Caminhos com ponto
 * ("cargo.cbo") são suportados. Junta todos os que faltam numa exceção só.
 */
export function exigir(objeto, campos, contexto = "dados") {
  const faltando = [];
  for (const caminho of campos) {
    const valor = caminho.split(".").reduce((acc, chave) => (acc == null ? acc : acc[chave]), objeto);
    if (valor === null || valor === undefined || valor === "") faltando.push(caminho);
  }
  if (faltando.length > 0) {
    throw new ErroXmlESocial(
      `Campos obrigatórios ausentes em ${contexto}: ${faltando.join(", ")}`,
      faltando,
    );
  }
}

/**
 * Remove recursivamente chaves com valor undefined/null/"" e objetos/arrays
 * que ficaram vazios. É o que mantém os grupos opcionais do S-2200 fora do
 * XML quando não vêm no formulário — sem espalhar `if` por toda a montagem.
 */
export function podarVazios(valor) {
  if (Array.isArray(valor)) {
    const limpo = valor.map(podarVazios).filter((item) => !ehVazio(item));
    return limpo;
  }
  if (valor && typeof valor === "object") {
    const limpo = {};
    for (const [chave, bruto] of Object.entries(valor)) {
      const podado = podarVazios(bruto);
      if (!ehVazio(podado)) limpo[chave] = podado;
    }
    return limpo;
  }
  return valor;
}

function ehVazio(valor) {
  if (valor === null || valor === undefined || valor === "") return true;
  if (Array.isArray(valor)) return valor.length === 0;
  if (typeof valor === "object") return Object.keys(valor).length === 0;
  return false;
}

/**
 * Monta o envelope <eSocial> + elemento do evento com Id, e serializa.
 * Todo evento do eSocial tem exatamente esta casca.
 */
export function montarEnvelope({ raiz, xmlns, id, corpo }) {
  const arvore = {
    eSocial: {
      "@xmlns": xmlns,
      [raiz]: {
        "@Id": id,
        ...corpo,
      },
    },
  };
  return create({ version: "1.0", encoding: "UTF-8" }, podarVazios(arvore)).end({
    prettyPrint: true,
  });
}

function verProcValido(informado) {
  const v = informado ? String(informado).trim() : VER_PROC_PADRAO;
  if (v.length < 1 || v.length > 20) {
    throw new ErroXmlESocial(`verProc deve ter de 1 a 20 caracteres (recebido: "${v}")`);
  }
  return v;
}

function xmlnsEvento(raiz) {
  return `http://www.esocial.gov.br/schema/evt/${raiz}/${VERSAO_LEIAUTE.replace(/^S_/, "v_S_")}`;
}

function validarDominio(campo, valor, valoresValidos, contexto) {
  const numero = Number(valor);
  if (!Number.isInteger(numero) || !valoresValidos.has(numero)) {
    throw new ErroXmlESocial(
      `${contexto}.${campo} deve ser um dos valores: ${[...valoresValidos].join(", ")} (recebido: ${valor})`,
    );
  }
  return numero;
}

function validarNumeroInscricao(tpInsc, nrInsc, contexto, comprimentos) {
  const numero = soDigitos(nrInsc);
  if (!comprimentos[tpInsc]?.includes(numero.length)) {
    throw new ErroXmlESocial(
      `${contexto}.nrInsc incompatível com tpInsc=${tpInsc}; esperado ${comprimentos[tpInsc].join(" ou ")} dígitos`,
    );
  }
  return numero;
}

/**
 * Partes comuns do topo de todo evento: Id, tpAmb, verProc e ideEmpregador.
 * `dados` traz { empregador: { tpInsc, nrInsc }, ambiente?, verProc?,
 * dataHoraGeracao?, sequencial? } — mesmo contrato descrito no gerarXmlS2200.
 */
function prepararCabecalho(dados, contexto) {
  exigir(dados, ["empregador.tpInsc", "empregador.nrInsc"], contexto);
  const tpInsc = validarDominio("tpInsc", dados.empregador.tpInsc, TP_INSC_EMPREGADOR, `${contexto}.empregador`);
  const nrInsc = validarNumeroInscricao(tpInsc, dados.empregador.nrInsc, `${contexto}.empregador`, { 1: [8, 14], 2: [11] });
  return {
    id: gerarIdEvento({
      tpInsc,
      nrInsc,
      dataHora: dados.dataHoraGeracao ?? new Date(),
      sequencial: dados.sequencial ?? 1,
    }),
    tpAmb: dados.ambiente === "producao" ? TP_AMB.PRODUCAO : TP_AMB.HOMOLOGACAO,
    verProc: verProcValido(dados.verProc),
    ideEmpregador: { tpInsc, nrInsc: tpInsc === 1 ? nrInsc.slice(0, 8) : nrInsc },
  };
}

function validarCpf(valor, campo) {
  const cpf = soDigitos(valor);
  if (cpf.length !== 11) throw new ErroXmlESocial(`${campo} deve conter 11 dígitos`);
  if (!cpfValido(cpf)) throw new ErroXmlESocial(`${campo} é inválido (dígito verificador)`);
  return cpf;
}

/**
 * Texto livre do XSD (xs:string com minLength/maxLength). `naoBranco` = padrão
 * ".*[^\s].*" (não só espaços); `inicioNaoBranco` = padrão "[^\s]{1}[\S\s]*"
 * dos TS_texto_* (primeiro caractere não pode ser espaço).
 */
function validarTexto(valor, campo, max, { min = 1, naoBranco = true, inicioNaoBranco = false } = {}) {
  const texto = String(valor);
  if (texto.length < min || texto.length > max || (naoBranco && texto.trim() === "")) {
    throw new ErroXmlESocial(`${campo} deve ter de ${min} a ${max} caracteres`);
  }
  if (inicioNaoBranco && /^\s/.test(texto)) {
    throw new ErroXmlESocial(`${campo} não pode começar com espaço`);
  }
  return texto;
}

/** Decimal > 0 com 2 casas (TS_vrRubr, TS_qtdRubr, TS_fator, TS_percAliment...). */
function formatarPositivo(valor, campo, maximo) {
  const texto = formatarValor(valor);
  const numero = Number(texto);
  if (numero <= 0 || numero > maximo) {
    throw new ErroXmlESocial(`${campo} deve ser maior que 0 e no máximo ${maximo} (recebido: ${valor})`);
  }
  return texto;
}

function validarLista(lista, campo, { min = 1, max }) {
  if (!Array.isArray(lista) || lista.length < min || lista.length > max) {
    throw new ErroXmlESocial(`${campo} deve ser uma lista com ${min} a ${max} itens`, [campo]);
  }
  return lista;
}

// ---------------------------------------------------------------------------
// S-2200 — Cadastramento Inicial do Vínculo e Admissão/Ingresso de Trabalhador
// ---------------------------------------------------------------------------

const RAIZ_S2200 = "evtAdmissao";

/**
 * Gera o XML do evento S-2200 (Admissão).
 *
 * @param {object} funcionario   Dados cadastrais da PESSOA (já validados por ES-5/ES-7):
 *   { cpf, nome, sexo:'M'|'F', racaCor, grauInstr, dataNascimento,
 *     paisNascimento='105', paisNacionalidade='105', nomeSocial?, estadoCivil?,
 *     endereco (obrigatório): { tipoLogradouro?, logradouro, numero,
 *                  complemento?, bairro?, cep, codMunicipio, uf },
 *     dependentes?: [{ tipo, nome, dataNascimento, cpf?, sexo?,
 *                      depIRRF, depSF, incTrab (S/N obrigatórios), descricao? }],
 *     contato?: { telefone?, email? } }
 *
 * @param {object} dadosAdmissao Dados do VÍNCULO / formulário de admissão:
 *   { empregador: { tpInsc:1|2, nrInsc },
 *     matricula, codCateg, dataAdmissao,
 *     tpRegTrab:1|2, tpRegPrev:1|2|3, cadIni:boolean,
 *     // celetista (tpRegTrab=1):
 *     tpAdmissao, indAdmissao, nrProcTrab?, tpRegJor, natAtividade,
 *     cnpjSindCategProf, dtBase?,
 *     // fgts: PROIBIDO se tpAdmissao=6 ou dataAdmissao >= 1988-10-05 (>=
 *     // 2015-10-01 p/ codCateg 104/doméstico) — praticamente toda admissão
 *     // atual; OBRIGATÓRIO fora dessas condições (vínculo pré-FGTS).
 *     fgts?: { dataOpcao }, aprendiz?: { indAprend, cnpjEntQual?, tpInsc?, nrInsc?, cnpjPrat? },
 *     // estatutário (tpRegTrab=2):
 *     estatutario?: { tpProv, dataExercicio, indTetoRGPS:boolean, tpPlanRP?,
 *                     indAbonoPerm?, dataInicioAbono? },
 *     cargo?: { nome, cbo, dataIngresso? }, funcao?: { nome, cbo },
 *     remuneracao?: { valorSalarioFixo, unidadeSalarioFixo, descricaoSalarioVariavel? },
 *     duracao?: { tpContr, dataTermino?, clausulaAssecuratoria?, objetoDeterminante? },
 *     localTrabalho?: { tpInsc, nrInsc, descricaoComplementar? },
 *     horContratual?: { qtdHrsSem?, tpJornada, tmpParc, horarioNoturno:boolean, descricaoJornada },
 *     observacoesContrato?: string[],
 *     // opcionais de topo:
 *     afastamento?: { dataInicio, codMotivo }, desligamento?: { data, motivo },
 *     // metadados de geração:
 *     ambiente?: 'producao'|'homologacao' (default homologacao),
 *     verProc?: string (1..20 chars; default 'EfficienceCo-1.0'),
 *     dataHoraGeracao?: Date,
 *     sequencial?: number (1..99999, default 1) — ES-7 DEVE passar um valor
 *       único por (empregador, segundo): o Id do evento é
 *       ID+tpInsc+nrInsc+AAAAMMDDHHMMSS+sequencial, sem componente por
 *       trabalhador; dois eventos do mesmo empregador no mesmo segundo com o
 *       mesmo sequencial geram Id idêntico e o 2º é recusado como duplicado. }
 *
 * @returns {string} XML do evento (com declaração <?xml?>, pretty-printed).
 */
export function gerarXmlS2200(funcionario, dadosAdmissao) {
  if (!funcionario || typeof funcionario !== "object") {
    throw new ErroXmlESocial("funcionario é obrigatório");
  }
  if (!dadosAdmissao || typeof dadosAdmissao !== "object") {
    throw new ErroXmlESocial("dadosAdmissao é obrigatório");
  }

  exigir(
    funcionario,
    ["cpf", "nome", "sexo", "racaCor", "grauInstr", "dataNascimento", "endereco"],
    "funcionario",
  );
  exigir(
    dadosAdmissao,
    [
      "empregador.tpInsc", "empregador.nrInsc", "matricula", "codCateg",
      "dataAdmissao", "tpRegTrab", "tpRegPrev", "cadIni",
    ],
    "dadosAdmissao",
  );

  const codCateg = Number(dadosAdmissao.codCateg);
  if (!CATEGORIAS_S2200.has(codCateg)) {
    throw new ErroXmlESocial(
      `codCateg ${dadosAdmissao.codCateg} não é válido para S-2200 no leiaute ${VERSAO_LEIAUTE}`,
    );
  }

  const tpRegTrab = validarDominio("tpRegTrab", dadosAdmissao.tpRegTrab, new Set([1, 2]), "dadosAdmissao");
  const tpRegPrev = validarDominio("tpRegPrev", dadosAdmissao.tpRegPrev, new Set([1, 2, 3, 4]), "dadosAdmissao");
  const categoriaEstatutaria = CATEGORIAS_ESTATUTARIAS.has(codCateg);
  // tpRegTrab: 1 = CLT/celetista, 2 = estatutário. Tem que casar com a
  // categoria — o XSD amarra infoEstatutario a tpRegTrab=2. Divergência é
  // erro de entrada, não é reconciliado em silêncio.
  if (categoriaEstatutaria && tpRegTrab !== 2) {
    throw new ErroXmlESocial(
      `codCateg ${codCateg} é estatutária mas tpRegTrab=${tpRegTrab} (esperado 2)`,
    );
  }
  if (!categoriaEstatutaria && tpRegTrab === 2) {
    throw new ErroXmlESocial(
      `tpRegTrab=2 (estatutário) mas codCateg ${codCateg} não é estatutária`,
    );
  }
  const ehEstatutario = tpRegTrab === 2;

  const { id, tpAmb, verProc, ideEmpregador } = prepararCabecalho(dadosAdmissao, "dadosAdmissao");

  const corpo = {
    ideEvento: {
      indRetif: 1, // 1 = evento original (retificação é fora do escopo do sprint)
      tpAmb,
      procEmi: PROC_EMI_APP_EMPREGADOR,
      verProc,
    },
    ideEmpregador,
    trabalhador: montarTrabalhador(funcionario),
    vinculo: {
      matricula: dadosAdmissao.matricula,
      tpRegTrab,
      tpRegPrev,
      cadIni: sn(dadosAdmissao.cadIni),
      infoRegimeTrab: ehEstatutario
        ? { infoEstatutario: montarInfoEstatutario(dadosAdmissao, tpRegPrev) }
        : { infoCeletista: montarInfoCeletista(dadosAdmissao, codCateg) },
      infoContrato: montarInfoContrato(dadosAdmissao, { codCateg, tpRegTrab }),
      afastamento: montarAfastamento(dadosAdmissao.afastamento),
      desligamento: montarDesligamento(dadosAdmissao.desligamento),
    },
  };

  return montarEnvelope({ raiz: RAIZ_S2200, xmlns: xmlnsEvento(RAIZ_S2200), id, corpo });
}

// --- grupos do S-2200 (funções separadas = reaproveitáveis por S-2205/S-2206) ---

function montarAfastamento(a) {
  if (!a) return undefined;
  exigir(a, ["dataInicio", "codMotivo"], "dadosAdmissao.afastamento");
  return { dtIniAfast: formatarData(a.dataInicio), codMotAfast: a.codMotivo };
}

function montarDesligamento(d) {
  if (!d) return undefined;
  exigir(d, ["data", "motivo"], "dadosAdmissao.desligamento");
  return { dtDeslig: formatarData(d.data), mtvDeslig: d.motivo };
}

function montarTrabalhador(f) {
  return {
    cpfTrab: validarCpf(f.cpf, "funcionario.cpf"),
    nmTrab: f.nome,
    sexo: f.sexo,
    racaCor: Number(f.racaCor),
    estCiv: f.estadoCivil != null && f.estadoCivil !== "" ? Number(f.estadoCivil) : undefined,
    grauInstr: String(f.grauInstr).padStart(2, "0"),
    nmSoc: f.nomeSocial,
    nascimento: montarNascimento(f),
    endereco: f.endereco ? montarEndereco(f.endereco) : undefined,
    dependente: Array.isArray(f.dependentes) && f.dependentes.length
      ? f.dependentes.map(montarDependente)
      : undefined,
    contato: f.contato
      ? { fonePrinc: soDigitos(f.contato.telefone) || undefined, emailPrinc: f.contato.email }
      : undefined,
  };
}

// Grupo {nascimento} do XSD S-1.3 (T_nascimento) é só dtNascto/paisNascto/
// paisNac — não existe naturalidade (codMunic/uf) aqui.
function montarNascimento(f) {
  return {
    dtNascto: formatarData(f.dataNascimento),
    paisNascto: f.paisNascimento || "105",
    paisNac: f.paisNacionalidade || "105",
  };
}

function montarEndereco(e) {
  exigir(e, ["logradouro", "numero", "cep", "codMunicipio", "uf"], "funcionario.endereco");
  return {
    brasil: {
      tpLograd: e.tipoLogradouro,
      dscLograd: e.logradouro,
      nrLograd: String(e.numero),
      complemento: e.complemento,
      bairro: e.bairro,
      cep: soDigitos(e.cep),
      codMunic: Number(e.codMunicipio),
      uf: e.uf,
    },
  };
}

function montarDependente(d) {
  // depIRRF/depSF/incTrab são S/N obrigatórios no XSD — sem default silencioso.
  exigir(d, ["nome", "dataNascimento", "depIRRF", "depSF", "incTrab"], "funcionario.dependentes[]");
  return {
    tpDep: d.tipo,
    nmDep: d.nome,
    dtNascto: formatarData(d.dataNascimento),
    cpfDep: d.cpf ? validarCpf(d.cpf, "funcionario.dependentes[].cpf") : undefined,
    sexoDep: d.sexo,
    depIRRF: sn(d.depIRRF),
    depSF: sn(d.depSF),
    incTrab: sn(d.incTrab),
    descrDep: d.descricao,
  };
}

// FGTS passou a ser obrigatório para todo celetista com a Constituição de
// 1988 (doméstico só em 2015, LC 150/2015). O grupo <FGTS> do XSD é o
// resquício do regime de opção ANTERIOR a essas datas — por isso o
// CONDICAO_GRUPO do XSD PROÍBE o grupo em admissões modernas (praticamente
// todas) e só o exige fora dessas condições.
const FGTS_OBRIGATORIO_DESDE_GERAL = "1988-10-05";
const FGTS_OBRIGATORIO_DESDE_DOMESTICO = "2015-10-01"; // codCateg 104

function fgtsProibidoNoXsd({ dtAdm, tpAdmissao, codCateg }) {
  if (Number(tpAdmissao) === 6) return true; // mudança de CPF
  const limiar = codCateg === 104 ? FGTS_OBRIGATORIO_DESDE_DOMESTICO : FGTS_OBRIGATORIO_DESDE_GERAL;
  return dtAdm >= limiar;
}

function montarInfoCeletista(dados, codCateg) {
  exigir(dados, ["dataAdmissao", "tpAdmissao", "indAdmissao", "tpRegJor", "natAtividade", "cnpjSindCategProf"], "dadosAdmissao (celetista)");
  if (codCateg === 106) exigir(dados, ["trabalhadorTemporario"], "dadosAdmissao (trabalhador temporario)");
  const tpRegJor = validarDominio("tpRegJor", dados.tpRegJor, new Set([1, 2, 3, 4]), "dadosAdmissao");
  const indAdmissao = validarDominio("indAdmissao", dados.indAdmissao, new Set([1, 2, 3]), "dadosAdmissao");
  const nrProcTrab = dados.nrProcTrab ? soDigitos(dados.nrProcTrab) : undefined;
  if (indAdmissao === 3 && nrProcTrab?.length !== 20) {
    throw new ErroXmlESocial(
      "dadosAdmissao.nrProcTrab deve conter 20 dígitos quando indAdmissao=3",
    );
  }
  if (indAdmissao !== 3 && nrProcTrab) {
    throw new ErroXmlESocial(
      "dadosAdmissao.nrProcTrab só pode ser informado quando indAdmissao=3",
    );
  }
  const cnpjSindCategProf = soDigitos(dados.cnpjSindCategProf);
  if (cnpjSindCategProf.length !== 14) {
    throw new ErroXmlESocial("dadosAdmissao.cnpjSindCategProf deve conter 14 dígitos");
  }
  const dtAdm = formatarData(dados.dataAdmissao);
  const proibidoFGTS = fgtsProibidoNoXsd({ dtAdm, tpAdmissao: dados.tpAdmissao, codCateg });
  if (proibidoFGTS && dados.fgts) {
    throw new ErroXmlESocial(
      "dadosAdmissao.fgts não pode ser informado: o grupo FGTS do XSD só existe para admissões " +
        `anteriores à obrigatoriedade do FGTS (${codCateg === 104 ? FGTS_OBRIGATORIO_DESDE_DOMESTICO : FGTS_OBRIGATORIO_DESDE_GERAL}); também é proibido quando tpAdmissao=6`,
    );
  }
  if (!proibidoFGTS && !dados.fgts) {
    throw new ErroXmlESocial("dadosAdmissao.fgts.dataOpcao é obrigatório para esta admissão (anterior à obrigatoriedade do FGTS)");
  }
  return {
    dtAdm,
    tpAdmissao: Number(dados.tpAdmissao),
    indAdmissao,
    nrProcTrab,
    tpRegJor,
    natAtividade: Number(dados.natAtividade),
    dtBase: dados.dtBase ? Number(dados.dtBase) : undefined,
    cnpjSindCategProf,
    FGTS: proibidoFGTS ? undefined : { dtOpcFGTS: formatarData(dados.fgts.dataOpcao) },
    trabTemporario: montarTrabTemporario(dados.trabalhadorTemporario),
    aprend: dados.aprendiz
      ? {
          indAprend: Number(dados.aprendiz.indAprend),
          cnpjEntQual: dados.aprendiz.cnpjEntQual ? soDigitos(dados.aprendiz.cnpjEntQual) : undefined,
          tpInsc: dados.aprendiz.tpInsc == null
            ? undefined
            : validarDominio("tpInsc", dados.aprendiz.tpInsc, TP_INSC_ESTAB_VINC, "dadosAdmissao.aprendiz"),
          nrInsc: dados.aprendiz.nrInsc
            ? validarNumeroInscricao(
              Number(dados.aprendiz.tpInsc),
              dados.aprendiz.nrInsc,
              "dadosAdmissao.aprendiz",
              { 1: [14], 2: [11] },
            )
            : undefined,
          cnpjPrat: dados.aprendiz.cnpjPrat ? soDigitos(dados.aprendiz.cnpjPrat) : undefined,
        }
      : undefined,
  };
}

function montarTrabTemporario(t) {
  if (!t) return undefined;
  exigir(t, ["hipoteseLegal", "justificativa", "estabelecimentoVinculo.tpInsc", "estabelecimentoVinculo.nrInsc"], "dadosAdmissao.trabalhadorTemporario");
  const tpInsc = validarDominio(
    "tpInsc",
    t.estabelecimentoVinculo.tpInsc,
    TP_INSC_ESTAB_VINC,
    "dadosAdmissao.trabalhadorTemporario.estabelecimentoVinculo",
  );
  const substituidos = Array.isArray(t.trabalhadoresSubstituidos) ? t.trabalhadoresSubstituidos : [];
  if (Number(t.hipoteseLegal) === 1 && substituidos.length === 0) {
    throw new ErroXmlESocial("dadosAdmissao.trabalhadorTemporario.trabalhadoresSubstituidos e obrigatorio quando hipoteseLegal=1");
  }
  if (Number(t.hipoteseLegal) === 2 && substituidos.length > 0) {
    throw new ErroXmlESocial("dadosAdmissao.trabalhadorTemporario.trabalhadoresSubstituidos nao pode ser informado quando hipoteseLegal=2");
  }
  if (![1, 2].includes(Number(t.hipoteseLegal))) {
    throw new ErroXmlESocial(`dadosAdmissao.trabalhadorTemporario.hipoteseLegal invalida: ${t.hipoteseLegal}`);
  }
  return {
    hipLeg: Number(t.hipoteseLegal),
    justContr: t.justificativa,
    ideEstabVinc: {
      tpInsc,
      nrInsc: validarNumeroInscricao(
        tpInsc,
        t.estabelecimentoVinculo.nrInsc,
        "dadosAdmissao.trabalhadorTemporario.estabelecimentoVinculo",
        { 1: [14], 2: [11] },
      ),
    },
    ideTrabSubstituido: substituidos.map((cpf) => ({ cpfTrabSubst: validarCpf(cpf, "dadosAdmissao.trabalhadorTemporario.trabalhadoresSubstituidos[]") })),
  };
}

function montarInfoEstatutario(dados, tpRegPrev) {
  const e = dados.estatutario || {};
  exigir(e, ["tpProv", "dataExercicio"], "dadosAdmissao.estatutario");
  if (tpRegPrev === 2) exigir(e, ["tpPlanRP", "indTetoRGPS", "indAbonoPerm"], "dadosAdmissao.estatutario");
  if (tpRegPrev !== 2 && (e.tpPlanRP != null || e.indTetoRGPS != null || e.indAbonoPerm != null || e.dataInicioAbono != null)) {
    throw new ErroXmlESocial("Campos de RPPS em dadosAdmissao.estatutario so podem ser informados quando tpRegPrev=2");
  }
  if (tpRegPrev === 2 && ![0, 1, 2, 3].includes(Number(e.tpPlanRP))) {
    throw new ErroXmlESocial(`dadosAdmissao.estatutario.tpPlanRP invalido: ${e.tpPlanRP}`);
  }
  // indTetoRGPS é obrigatório e exclusivo de tpRegPrev = 2 (RPPS).
  let indTetoRGPS;
  if (tpRegPrev === 2) {
    if (e.indTetoRGPS === undefined || e.indTetoRGPS === null) {
      throw new ErroXmlESocial(
        "dadosAdmissao.estatutario.indTetoRGPS é obrigatório quando tpRegPrev=2 (S/N)",
        ["estatutario.indTetoRGPS"],
      );
    }
    indTetoRGPS = sn(e.indTetoRGPS);
  }
  return {
    tpProv: Number(e.tpProv),
    dtExercicio: formatarData(e.dataExercicio),
    tpPlanRP: tpRegPrev === 2 ? Number(e.tpPlanRP) : undefined,
    indTetoRGPS,
    indAbonoPerm: tpRegPrev === 2 ? sn(e.indAbonoPerm) : undefined,
    dtIniAbono: tpRegPrev === 2 && e.dataInicioAbono ? formatarData(e.dataInicioAbono) : undefined,
  };
}

function montarInfoContrato(dados, { codCateg, tpRegTrab }) {
  const ehCeletista = tpRegTrab === 1;
  const comDesligamento = Boolean(dados.desligamento);
  const tpRegJor = ehCeletista ? Number(dados.tpRegJor) : undefined;
  // Grupos obrigatórios de infoContrato no XSD do S-2200 (minOccurs=1). Se
  // algum vier ausente, falha aqui — não vaza XML incompleto que só seria
  // pego na submissão ao eSocial.
  if (ehCeletista && !comDesligamento) {
    exigir(dados, ["remuneracao", "duracao", "localTrabalho"], "dadosAdmissao (infoContrato)");
  } else if (!comDesligamento) {
    exigir(dados, ["localTrabalho"], "dadosAdmissao (infoContrato)");
  }
  if (!ehCeletista && (dados.remuneracao || dados.duracao)) {
    throw new ErroXmlESocial("remuneracao e duracao nao podem ser informadas para tpRegTrab=2 (estatutario)");
  }
  if (ehCeletista && tpRegJor === 1 && !comDesligamento) {
    exigir(dados, ["horContratual"], "dadosAdmissao (infoContrato)");
  }
  // nmCargo presente ⇒ CBOCargo obrigatório no S-2200.
  if (dados.cargo) exigir(dados.cargo, ["nome", "cbo"], "dadosAdmissao.cargo");

  return {
    nmCargo: dados.cargo?.nome,
    CBOCargo: dados.cargo?.cbo ? soDigitos(dados.cargo.cbo) : undefined,
    dtIngrCargo: dados.cargo?.dataIngresso ? formatarData(dados.cargo.dataIngresso) : undefined,
    nmFuncao: dados.funcao?.nome,
    CBOFuncao: dados.funcao?.cbo ? soDigitos(dados.funcao.cbo) : undefined,
    codCateg,
    remuneracao: montarRemuneracao(dados.remuneracao),
    duracao: montarDuracao(dados.duracao),
    localTrabalho: montarLocalTrabalho(dados.localTrabalho, codCateg),
    horContratual: montarHorContratual(dados.horContratual, codCateg),
    observacoes: Array.isArray(dados.observacoesContrato)
      ? dados.observacoesContrato.map((texto) => ({ observacao: texto }))
      : undefined,
  };
}

function montarRemuneracao(r) {
  if (!r) return undefined;
  exigir(r, ["valorSalarioFixo", "unidadeSalarioFixo"], "dadosAdmissao.remuneracao");
  const salario = formatarValor(r.valorSalarioFixo);
  const unidade = validarDominio("unidadeSalarioFixo", r.unidadeSalarioFixo, new Set([1, 2, 3, 4, 5, 6, 7]), "dadosAdmissao.remuneracao");
  if (unidade === 7 && Number(salario) !== 0) {
    throw new ErroXmlESocial("vrSalFx deve ser 0 quando undSalFixo=7 (salario exclusivamente variavel)");
  }
  if (unidade !== 7 && Number(salario) <= 0) {
    throw new ErroXmlESocial(`vrSalFx (salário fixo) deve ser maior que zero (recebido: ${r.valorSalarioFixo})`);
  }
  if ([6, 7].includes(unidade)) exigir(r, ["descricaoSalarioVariavel"], "dadosAdmissao.remuneracao");
  return {
    vrSalFx: salario,
    undSalFixo: unidade,
    dscSalVar: r.descricaoSalarioVariavel,
  };
}

function montarDuracao(d) {
  if (!d) return undefined;
  exigir(d, ["tpContr"], "dadosAdmissao.duracao");
  const tpContr = validarDominio("tpContr", d.tpContr, new Set([1, 2, 3]), "dadosAdmissao.duracao");
  if (tpContr === 1 && (d.dataTermino || d.clausulaAssecuratoria != null || d.objetoDeterminante)) {
    throw new ErroXmlESocial("Campos de prazo determinado nao podem ser informados quando tpContr=1");
  }
  if (tpContr === 2) exigir(d, ["dataTermino", "clausulaAssecuratoria"], "dadosAdmissao.duracao");
  if (tpContr === 3) exigir(d, ["clausulaAssecuratoria", "objetoDeterminante"], "dadosAdmissao.duracao");
  return {
    tpContr,
    dtTerm: d.dataTermino ? formatarData(d.dataTermino) : undefined,
    clauAssec: d.clausulaAssecuratoria !== undefined ? sn(d.clausulaAssecuratoria) : undefined,
    objDet: d.objetoDeterminante,
  };
}

function montarLocalTrabalho(l, codCateg) {
  if (!l) return undefined;
  const exigeLocalTempDom = [104, 106].includes(codCateg);
  if (exigeLocalTempDom) exigir(l, ["endereco"], "dadosAdmissao.localTrabalho");
  if (codCateg !== 104) exigir(l, ["tpInsc", "nrInsc"], "dadosAdmissao.localTrabalho");

  return {
    localTrabGeral: codCateg === 104 ? undefined : montarLocalTrabGeral(l),
    localTempDom: exigeLocalTempDom ? montarEnderecoLocal(l.endereco) : undefined,
  };
}

function montarLocalTrabGeral(l) {
  const tpInsc = validarDominio("tpInsc", l.tpInsc, TP_INSC_LOCAL_GERAL, "dadosAdmissao.localTrabalho");
  return {
    tpInsc,
    nrInsc: validarNumeroInscricao(tpInsc, l.nrInsc, "dadosAdmissao.localTrabalho", { 1: [14], 3: [12], 4: [12] }),
    descComp: l.descricaoComplementar,
  };
}

function montarEnderecoLocal(endereco) {
  exigir(endereco, ["logradouro", "numero", "cep", "codMunicipio", "uf"], "dadosAdmissao.localTrabalho.endereco");
  return {
    tpLograd: endereco.tipoLogradouro,
    dscLograd: endereco.logradouro,
    nrLograd: String(endereco.numero),
    complemento: endereco.complemento,
    bairro: endereco.bairro,
    cep: soDigitos(endereco.cep),
    codMunic: Number(endereco.codMunicipio),
    uf: endereco.uf,
  };
}

function montarHorContratual(h, codCateg) {
  if (!h) return undefined;
  exigir(h, ["tpJornada", "tmpParc", "descricaoJornada"], "dadosAdmissao.horContratual");
  if (codCateg !== 111) exigir(h, ["qtdHrsSem", "horarioNoturno"], "dadosAdmissao.horContratual");
  const tpJornada = validarDominio("tpJornada", h.tpJornada, TP_JORNADA, "dadosAdmissao.horContratual");
  const tmpParc = validarDominio("tmpParc", h.tmpParc, TMP_PARC, "dadosAdmissao.horContratual");
  if (tmpParc === 1 && codCateg !== 104) {
    throw new ErroXmlESocial("dadosAdmissao.horContratual.tmpParc=1 so e valido para codCateg=104");
  }
  if ([2, 3].includes(tmpParc) && codCateg === 104) {
    throw new ErroXmlESocial("dadosAdmissao.horContratual.tmpParc=2 ou 3 nao e valido para codCateg=104");
  }
  return {
    qtdHrsSem: validarQtdHrsSem(h.qtdHrsSem),
    tpJornada,
    tmpParc,
    horNoturno: h.horarioNoturno == null ? undefined : sn(h.horarioNoturno),
    dscJorn: h.descricaoJornada,
  };
}

function validarQtdHrsSem(valor) {
  if (valor == null || valor === "") return undefined;
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero <= 0 || numero > 99.99 || !/^\d{1,2}(\.\d{1,2})?$/.test(String(valor))) {
    throw new ErroXmlESocial(`dadosAdmissao.horContratual.qtdHrsSem invalida: ${valor}`);
  }
  return numero.toFixed(2);
}

/**
 * Valor monetário no formato do eSocial: ponto decimal, 2 casas, não-negativo.
 * Os campos que usam isto no S-2200 (vrSalFx) são sempre > 0. Se um evento
 * futuro precisar de valor negativo, adicionar um parâmetro `permiteNegativo`.
 */
export function formatarValor(valor) {
  let num;
  if (typeof valor === "number") {
    num = valor;
  } else {
    // Aceita "3500.50" (ponto decimal) e o formato pt-BR "3.500,00" (ponto de
    // milhar + vírgula decimal). Remove R$/espaços antes. String sem vírgula e
    // com ponto seguido de != 2 dígitos é AMBÍGUA ("3.500" = 3500 ou 3,5?) —
    // lança em vez de adivinhar.
    let s = String(valor).trim().replace(/^r\$\s*/i, "").replace(/\s/g, "");
    if (s.includes(",")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else if (s.includes(".") && !/^\d+\.\d{1,2}$/.test(s)) {
      throw new ErroXmlESocial(`Valor monetário ambíguo (use vírgula decimal ou até 2 casas): "${valor}"`);
    }
    num = Number(s);
  }
  if (!Number.isFinite(num)) throw new ErroXmlESocial(`Valor monetário inválido: "${valor}"`);
  if (num < 0) throw new ErroXmlESocial(`Valor monetário não pode ser negativo: "${valor}"`);
  return num.toFixed(2);
}

// ---------------------------------------------------------------------------
// Rubricas — usadas por S-2299 (detVerbas) e S-1200 (itensRemun)
// ---------------------------------------------------------------------------
// Os dois eventos têm o mesmo xs:sequence de rubrica (codRubr, ideTabRubr,
// qtdRubr, fatorRubr, vrRubr, indApurIR). O grupo <descFolha> (empréstimo
// consignado, natRubr 9253) NÃO é suportado nesta versão.

// indApurIR é "obrigatório e exclusivo" a partir de 2021-07 (mensal) / 2021
// (anual), conforme anotação do XSD nos dois eventos.
const INICIO_IND_APUR_IR_MENSAL = "2021-07";
const INICIO_IND_APUR_IR_ANUAL = "2021";

function montarRubrica(r, contexto, exigeIndApurIR) {
  exigir(r, ["codigo", "tabela", "valor"], contexto);
  if (exigeIndApurIR) exigir(r, ["indApurIR"], contexto);
  if (!exigeIndApurIR && r.indApurIR != null && r.indApurIR !== "") {
    throw new ErroXmlESocial(
      `${contexto}.indApurIR só pode ser informado a partir de ${INICIO_IND_APUR_IR_MENSAL} (mensal) / ${INICIO_IND_APUR_IR_ANUAL} (anual)`,
    );
  }
  return {
    codRubr: validarTexto(r.codigo, `${contexto}.codigo`, 30),
    ideTabRubr: validarTexto(r.tabela, `${contexto}.tabela`, 8),
    qtdRubr: r.quantidade == null || r.quantidade === "" ? undefined : formatarPositivo(r.quantidade, `${contexto}.quantidade`, 9999999999.99),
    fatorRubr: r.fator == null || r.fator === "" ? undefined : formatarPositivo(r.fator, `${contexto}.fator`, 999.99),
    vrRubr: formatarPositivo(r.valor, `${contexto}.valor`, 999999999999.99),
    indApurIR: exigeIndApurIR ? validarDominio("indApurIR", r.indApurIR, new Set([0, 1]), contexto) : undefined,
  };
}

// ideEstabLot: tpInsc 1 (CNPJ, 14), 3 (CAEPF, 12) ou 4 (CNO, 12) — TS_tpInsc_EstabLot.
function montarIdeEstabLot(e, contexto) {
  exigir(e, ["tpInsc", "nrInsc", "codLotacao"], contexto);
  const tpInsc = validarDominio("tpInsc", e.tpInsc, TP_INSC_LOCAL_GERAL, contexto);
  return {
    tpInsc,
    nrInsc: validarNumeroInscricao(tpInsc, e.nrInsc, contexto, { 1: [14], 3: [12], 4: [12] }),
    codLotacao: validarTexto(e.codLotacao, `${contexto}.codLotacao`, 30),
  };
}

const GRAU_EXP = new Set([1, 2, 3, 4]);

function montarInfoAgNocivo(grauExp, regra, contexto) {
  const informado = grauExp != null && grauExp !== "";
  if (regra === "obrigatorio" && !informado) {
    throw new ErroXmlESocial(`${contexto}.grauExp é obrigatório (grau de exposição a agentes nocivos)`, ["grauExp"]);
  }
  if (regra === "proibido" && informado) {
    throw new ErroXmlESocial(`${contexto}.grauExp não pode ser informado para esta categoria`);
  }
  return informado ? { grauExp: validarDominio("grauExp", grauExp, GRAU_EXP, contexto) } : undefined;
}

function validarIdesDmDevUnicos(demonstrativos, contexto) {
  const vistos = new Set();
  for (const dm of demonstrativos) {
    if (vistos.has(dm.ideDmDev)) {
      throw new ErroXmlESocial(`${contexto}: ideDmDev "${dm.ideDmDev}" repetido — cada demonstrativo precisa de um identificador único`);
    }
    vistos.add(dm.ideDmDev);
  }
}

// Grupo infoInterm (trabalho intermitente, codCateg 111): 1..31 dias.
function montarInfoInterm(lista, contexto) {
  return validarLista(lista, contexto, { max: 31 }).map((item, i) => {
    exigir(item, ["dia"], `${contexto}[${i}]`);
    const dia = Number(item.dia);
    if (!Number.isInteger(dia) || dia < 0 || dia > 31) {
      throw new ErroXmlESocial(`${contexto}[${i}].dia deve ser inteiro de 0 a 31`);
    }
    const hrsTrab = item.horasTrabalhadas == null || item.horasTrabalhadas === "" ? undefined : String(item.horasTrabalhadas);
    if (hrsTrab !== undefined && !/^([0-1]\d|2[0-3])[0-5]\d$/.test(hrsTrab)) {
      throw new ErroXmlESocial(`${contexto}[${i}].horasTrabalhadas deve estar no formato HHMM`);
    }
    return { dia, hrsTrab };
  });
}

// ---------------------------------------------------------------------------
// S-2299 — Desligamento
// ---------------------------------------------------------------------------
// CONFERIDO CONTRA O XSD OFICIAL S-1.3 (evtDeslig.xsd / tipos.xsd) — ver
// docs/validacao-s2299-s1200-xsd.md. Regras condicionais das anotações do
// XSD (CONDICAO_GRUPO / Validação) que dependem só do próprio evento são
// aplicadas aqui; as que dependem do RET/S-1000 (ex.: início dos periódicos)
// ficam para o eSocial.
//
// Fora do escopo desta versão: infoPerAnt, infoRRA, procJudTrab, infoMV,
// procCS e infoSimples dentro de verbasResc; consigFGTS; descFolha.

const RAIZ_S2299 = "evtDeslig";

// Tabela 19 — motivos que ligam/desligam grupos do infoDeslig.
const MTV_SUCESSAO_VINC = new Set([11, 12, 13, 28, 29, 37, 43]);
const MTV_TRANSF_TIT = 34;
const MTV_MUDANCA_CPF = 36;
const MTV_SEM_PDV = new Set([10, 11, 12, 13, 28, 29, 30, 34, 36, 37, 40, 43, 44]);
const MTV_SEM_VERBAS_RESC = new Set([11, 12, 13, 25, 28, 29, 30, 34, 36, 43, 44]);
// indRemun (remunAposDeslig) é obrigatório para desligamentos a partir desta data.
const IND_REMUN_OBRIGATORIO_DESDE = "2023-01-16";

/**
 * Gera o XML do evento S-2299 (Desligamento).
 *
 * @param {object} dados
 *   { empregador: { tpInsc:1|2, nrInsc }, cpf, matricula,
 *     tpRegTrab: 1|2 (do S-2200 do vínculo — decide pensAlim e verbasResc),
 *     tpRegPrev?: 1|2|3|4 (do S-2200; ausente = RGPS para fins de grauExp),
 *     codCateg?: number (do S-2200; 111 = intermitente exige infoInterm),
 *     desligamento: {
 *       motivo (Tabela 19), data, dataAvisoPrevio?, indPagtoAPI (S/N),
 *       dataProjFimAPI? (obrigatória se indPagtoAPI=S),
 *       pensaoAlimenticia?: { tipo:0|1|2|3, percentual?, valor? } (obrigatória p/ celetista),
 *       nrProcTrab?, indPDV?: boolean, observacoes?: string[],
 *       sucessaoVinc?: { tpInsc:1|2, nrInsc }   (motivos 11,12,13,28,29,37,43),
 *       transfTit?: { cpfSubstituto, dataNascimento } (motivo 34),
 *       mudancaCPF?: { novoCPF }                (motivo 36),
 *       remunAposDeslig?: { indRemun?:1|2|3, dataFim } },
 *     infoInterm?: [{ dia, horasTrabalhadas? (HHMM) }],
 *     verbasRescisorias?: { demonstrativos: [{ ideDmDev, estabelecimentos: [{
 *       tpInsc:1|3|4, nrInsc, codLotacao, grauExp?,
 *       rubricas: [{ codigo, tabela, quantidade?, fator?, valor, indApurIR? }] }] }] },
 *     // metadados de geração — mesmo contrato do gerarXmlS2200:
 *     ambiente?, verProc?, dataHoraGeracao?, sequencial? }
 *
 * `desligamento.data` também é o campo lido por desligarFuncionarioDeS2299
 * após a aprovação.
 *
 * @returns {string} XML do evento.
 */
export function gerarXmlS2299(dados) {
  if (!dados || typeof dados !== "object") {
    throw new ErroXmlESocial("dados do desligamento são obrigatórios");
  }
  exigir(
    dados,
    [
      "empregador.tpInsc", "empregador.nrInsc", "cpf", "matricula", "tpRegTrab",
      "desligamento.motivo", "desligamento.data", "desligamento.indPagtoAPI",
    ],
    "dadosDesligamento",
  );
  const { id, tpAmb, verProc, ideEmpregador } = prepararCabecalho(dados, "dadosDesligamento");
  const tpRegTrab = validarDominio("tpRegTrab", dados.tpRegTrab, new Set([1, 2]), "dadosDesligamento");

  const corpo = {
    ideEvento: { indRetif: 1, tpAmb, procEmi: PROC_EMI_APP_EMPREGADOR, verProc },
    ideEmpregador,
    ideVinculo: {
      cpfTrab: validarCpf(dados.cpf, "dadosDesligamento.cpf"),
      matricula: validarTexto(dados.matricula, "dadosDesligamento.matricula", 30, { naoBranco: false }),
    },
    infoDeslig: montarInfoDeslig(dados, tpRegTrab),
  };

  return montarEnvelope({ raiz: RAIZ_S2299, xmlns: xmlnsEvento(RAIZ_S2299), id, corpo });
}

function montarInfoDeslig(dados, tpRegTrab) {
  const d = dados.desligamento;
  const ctx = "dadosDesligamento.desligamento";

  const motivo = Number(d.motivo);
  if (!/^\d{1,2}$/.test(String(d.motivo).trim()) || motivo < 1) {
    throw new ErroXmlESocial(`${ctx}.motivo deve ser um código da Tabela 19 (01 a 99)`);
  }
  const dtDeslig = formatarData(d.data);

  const dtAvPrv = d.dataAvisoPrevio ? formatarData(d.dataAvisoPrevio) : undefined;
  if (dtAvPrv && dtAvPrv > dtDeslig) {
    throw new ErroXmlESocial(`${ctx}.dataAvisoPrevio deve ser igual ou anterior à data de desligamento`);
  }

  const indPagtoAPI = sn(d.indPagtoAPI);
  if (indPagtoAPI === "S") exigir(d, ["dataProjFimAPI"], ctx);
  const dtProjFimAPI = d.dataProjFimAPI ? formatarData(d.dataProjFimAPI) : undefined;
  if (dtProjFimAPI && dtProjFimAPI < dtDeslig) {
    throw new ErroXmlESocial(`${ctx}.dataProjFimAPI deve ser igual ou posterior à data de desligamento`);
  }

  const nrProcTrab = d.nrProcTrab ? soDigitos(d.nrProcTrab) : undefined;
  if (nrProcTrab !== undefined && nrProcTrab.length !== 20) {
    throw new ErroXmlESocial(`${ctx}.nrProcTrab deve conter 20 dígitos`);
  }

  const pdv = d.indPDV != null && d.indPDV !== "" && sn(d.indPDV) === "S";
  if (pdv && MTV_SEM_PDV.has(motivo)) {
    throw new ErroXmlESocial(`${ctx}.indPDV não pode ser informado para o motivo ${motivo}`);
  }

  const codCateg = dados.codCateg == null || dados.codCateg === "" ? undefined : Number(dados.codCateg);
  if (codCateg === 111) exigir(dados, ["infoInterm"], "dadosDesligamento (intermitente)");
  if (codCateg !== undefined && codCateg !== 111 && dados.infoInterm) {
    throw new ErroXmlESocial("dadosDesligamento.infoInterm só pode ser informado para codCateg=111 (intermitente)");
  }

  const observacoes = d.observacoes == null
    ? undefined
    : validarLista(d.observacoes, `${ctx}.observacoes`, { min: 0, max: 99 }).map((texto, i) => ({
      observacao: validarTexto(texto, `${ctx}.observacoes[${i}]`, 255, { inicioNaoBranco: true }),
    }));

  if (dados.verbasRescisorias && (MTV_SEM_VERBAS_RESC.has(motivo) || tpRegTrab === 2)) {
    throw new ErroXmlESocial(
      `dadosDesligamento.verbasRescisorias não pode ser informado ${tpRegTrab === 2 ? "para estatutário (tpRegTrab=2)" : `para o motivo ${motivo}`}`,
    );
  }

  return {
    mtvDeslig: String(motivo).padStart(2, "0"),
    dtDeslig,
    dtAvPrv,
    indPagtoAPI,
    dtProjFimAPI,
    ...montarPensaoAlimenticia(d.pensaoAlimenticia, tpRegTrab, ctx),
    nrProcTrab,
    indPDV: pdv ? "S" : undefined,
    infoInterm: dados.infoInterm ? montarInfoInterm(dados.infoInterm, "dadosDesligamento.infoInterm") : undefined,
    observacoes,
    sucessaoVinc: montarGrupoPorMotivo(d.sucessaoVinc, MTV_SUCESSAO_VINC.has(motivo), `${ctx}.sucessaoVinc`, motivo, (s, c) => {
      exigir(s, ["tpInsc", "nrInsc"], c);
      const tpInsc = validarDominio("tpInsc", s.tpInsc, TP_INSC_ESTAB_VINC, c);
      return { tpInsc, nrInsc: validarNumeroInscricao(tpInsc, s.nrInsc, c, { 1: [14], 2: [11] }) };
    }),
    transfTit: montarGrupoPorMotivo(d.transfTit, motivo === MTV_TRANSF_TIT, `${ctx}.transfTit`, motivo, (t, c) => {
      exigir(t, ["cpfSubstituto", "dataNascimento"], c);
      return { cpfSubstituto: validarCpf(t.cpfSubstituto, `${c}.cpfSubstituto`), dtNascto: formatarData(t.dataNascimento) };
    }),
    mudancaCPF: montarGrupoPorMotivo(d.mudancaCPF, motivo === MTV_MUDANCA_CPF, `${ctx}.mudancaCPF`, motivo, (m, c) => {
      exigir(m, ["novoCPF"], c);
      return { novoCPF: validarCpf(m.novoCPF, `${c}.novoCPF`) };
    }),
    verbasResc: dados.verbasRescisorias ? montarVerbasResc(dados, dtDeslig) : undefined,
    remunAposDeslig: montarRemunAposDeslig(d.remunAposDeslig, dtDeslig, ctx),
  };
}

// CONDICAO_GRUPO "O (se mtvDeslig = [...]); N (nos demais casos)".
function montarGrupoPorMotivo(grupo, obrigatorio, contexto, motivo, montar) {
  if (obrigatorio && !grupo) {
    throw new ErroXmlESocial(`${contexto} é obrigatório para o motivo ${motivo}`, [contexto]);
  }
  if (!obrigatorio && grupo) {
    throw new ErroXmlESocial(`${contexto} não pode ser informado para o motivo ${motivo}`);
  }
  return grupo ? montar(grupo, contexto) : undefined;
}

// pensAlim: "obrigatório e exclusivo" para celetista (tpRegTrab=1).
// percAliment se tipo 1/3; vrAlim se tipo 2/3 — ambos "obrigatório e exclusivo".
function montarPensaoAlimenticia(p, tpRegTrab, ctx) {
  if (tpRegTrab === 2) {
    if (p) throw new ErroXmlESocial(`${ctx}.pensaoAlimenticia só pode ser informada para celetista (tpRegTrab=1)`);
    return {};
  }
  if (!p) throw new ErroXmlESocial(`${ctx}.pensaoAlimenticia.tipo é obrigatório para celetista (tpRegTrab=1)`, ["desligamento.pensaoAlimenticia"]);
  exigir(p, ["tipo"], `${ctx}.pensaoAlimenticia`);
  const tipo = validarDominio("tipo", p.tipo, new Set([0, 1, 2, 3]), `${ctx}.pensaoAlimenticia`);
  const comPercentual = tipo === 1 || tipo === 3;
  const comValor = tipo === 2 || tipo === 3;
  if (comPercentual) exigir(p, ["percentual"], `${ctx}.pensaoAlimenticia`);
  if (comValor) exigir(p, ["valor"], `${ctx}.pensaoAlimenticia`);
  if (!comPercentual && p.percentual != null && p.percentual !== "") {
    throw new ErroXmlESocial(`${ctx}.pensaoAlimenticia.percentual só pode ser informado quando tipo=1 ou 3`);
  }
  if (!comValor && p.valor != null && p.valor !== "") {
    throw new ErroXmlESocial(`${ctx}.pensaoAlimenticia.valor só pode ser informado quando tipo=2 ou 3`);
  }
  return {
    pensAlim: tipo,
    percAliment: comPercentual ? formatarPositivo(p.percentual, `${ctx}.pensaoAlimenticia.percentual`, 100) : undefined,
    vrAlim: comValor ? formatarPositivo(p.valor, `${ctx}.pensaoAlimenticia.valor`, 999999999999.99) : undefined,
  };
}

function montarVerbasResc(dados, dtDeslig) {
  const ctx = "dadosDesligamento.verbasRescisorias";
  const demonstrativos = validarLista(dados.verbasRescisorias.demonstrativos, `${ctx}.demonstrativos`, { max: 50 });
  validarIdesDmDevUnicos(demonstrativos, ctx);
  const exigeIndApurIR = dtDeslig.slice(0, 7) >= INICIO_IND_APUR_IR_MENSAL;
  // infoAgNocivo: "O (se o trabalhador estiver amparado pelo RGPS); N (nos demais casos)".
  const regraAgNocivo = dados.tpRegPrev == null || Number(dados.tpRegPrev) === 1 ? "obrigatorio" : "proibido";

  return {
    dmDev: demonstrativos.map((dm, i) => {
      const cDm = `${ctx}.demonstrativos[${i}]`;
      exigir(dm, ["ideDmDev"], cDm);
      return {
        ideDmDev: validarTexto(dm.ideDmDev, `${cDm}.ideDmDev`, 30),
        // Só verbas do mês do desligamento (infoPerApur) — infoPerAnt fora do escopo,
        // então infoPerApur passa a ser obrigatório.
        infoPerApur: {
          ideEstabLot: validarLista(dm.estabelecimentos, `${cDm}.estabelecimentos`, { max: 24 }).map((e, j) => {
            const cE = `${cDm}.estabelecimentos[${j}]`;
            return {
              ...montarIdeEstabLot(e, cE),
              detVerbas: validarLista(e.rubricas, `${cE}.rubricas`, { max: 200 })
                .map((r, k) => montarRubrica(r, `${cE}.rubricas[${k}]`, exigeIndApurIR)),
              infoAgNocivo: montarInfoAgNocivo(e.grauExp, regraAgNocivo, cE),
            };
          }),
        },
      };
    }),
  };
}

function montarRemunAposDeslig(r, dtDeslig, ctx) {
  if (!r) return undefined;
  const c = `${ctx}.remunAposDeslig`;
  exigir(r, ["dataFim"], c);
  if (dtDeslig >= IND_REMUN_OBRIGATORIO_DESDE) exigir(r, ["indRemun"], c);
  const dtFimRemun = formatarData(r.dataFim);
  if (dtFimRemun <= dtDeslig) {
    throw new ErroXmlESocial(`${c}.dataFim deve ser posterior à data de desligamento`);
  }
  return {
    indRemun: r.indRemun == null || r.indRemun === "" ? undefined : validarDominio("indRemun", r.indRemun, new Set([1, 2, 3]), c),
    dtFimRemun,
  };
}

// ---------------------------------------------------------------------------
// S-1200 — Remuneração de trabalhador vinculado ao RGPS
// ---------------------------------------------------------------------------
// CONFERIDO CONTRA O XSD OFICIAL S-1.3 (evtRemun.xsd / tipos.xsd) — ver
// docs/validacao-s2299-s1200-xsd.md.
//
// Um evento por trabalhador por competência (CHAVE: cpfTrab + perApur). As
// rubricas vêm prontas no formulário: a folha do sistema (folha.service.js)
// ainda não tem tabela de rubricas (S-1010), então não há mapeamento
// automático folha -> S-1200 nesta versão.
//
// Fora do escopo desta versão: infoPerAnt (diferenças de períodos
// anteriores), infoRRA, infoMV, procJudTrab, sucessaoVinc e descFolha.

const RAIZ_S1200 = "evtRemun";

/**
 * Gera o XML do evento S-1200 (Remuneração).
 *
 * @param {object} dados
 *   { empregador: { tpInsc:1|2, nrInsc },
 *     indApuracao: 1 (mensal) | 2 (anual — 13º),
 *     perApur: "AAAA-MM" (mensal) | "AAAA" (anual),
 *     cpf,
 *     infoComplementar?: { nome, dataNascimento } (trabalhador sem cadastro no RET),
 *     infoInterm?: [{ dia, horasTrabalhadas? }] (obrigatório se algum demonstrativo
 *                  for codCateg 111 em apuração mensal),
 *     demonstrativos: [{
 *       ideDmDev, codCateg,
 *       estabelecimentos: [{ tpInsc:1|3|4, nrInsc, codLotacao, qtdDiasAvulso?,
 *         remuneracoes: [{ matricula?, indSimples?:1|2|3, grauExp?,
 *           rubricas: [{ codigo, tabela, quantidade?, fator?, valor, indApurIR? }] }] }],
 *       infoComplCont?: { codCBO, natAtividade?:1|2, qtdDiasTrab? } }],
 *     ambiente?, verProc?, dataHoraGeracao?, sequencial? }
 *
 * @returns {string} XML do evento.
 */
export function gerarXmlS1200(dados) {
  if (!dados || typeof dados !== "object") {
    throw new ErroXmlESocial("dados da remuneração são obrigatórios");
  }
  exigir(
    dados,
    ["empregador.tpInsc", "empregador.nrInsc", "indApuracao", "perApur", "cpf", "demonstrativos"],
    "dadosRemuneracao",
  );
  const { id, tpAmb, verProc, ideEmpregador } = prepararCabecalho(dados, "dadosRemuneracao");
  const indApuracao = validarDominio("indApuracao", dados.indApuracao, new Set([1, 2]), "dadosRemuneracao");
  const perApur = formatarPerApur(dados.perApur, indApuracao);
  const exigeIndApurIR = indApuracao === 1
    ? perApur >= INICIO_IND_APUR_IR_MENSAL
    : perApur >= INICIO_IND_APUR_IR_ANUAL;

  const demonstrativos = validarLista(dados.demonstrativos, "dadosRemuneracao.demonstrativos", { max: 999 });
  validarIdesDmDevUnicos(demonstrativos, "dadosRemuneracao");

  // infoInterm: "O (se codCateg = [111], indApuracao = [1] e existir infoPerApur); N (nos demais casos)".
  const exigeInterm = indApuracao === 1 && demonstrativos.some((dm) => Number(dm.codCateg) === 111);
  if (exigeInterm) exigir(dados, ["infoInterm"], "dadosRemuneracao (intermitente)");
  if (!exigeInterm && dados.infoInterm) {
    throw new ErroXmlESocial("dadosRemuneracao.infoInterm só pode ser informado em apuração mensal com demonstrativo de codCateg=111");
  }

  const ic = dados.infoComplementar;
  if (ic) exigir(ic, ["nome", "dataNascimento"], "dadosRemuneracao.infoComplementar");

  const corpo = {
    ideEvento: {
      indRetif: 1,
      indApuracao,
      perApur,
      tpAmb,
      procEmi: PROC_EMI_APP_EMPREGADOR,
      verProc,
    },
    ideEmpregador,
    ideTrabalhador: {
      cpfTrab: validarCpf(dados.cpf, "dadosRemuneracao.cpf"),
      infoComplem: ic
        ? { nmTrab: validarTexto(ic.nome, "dadosRemuneracao.infoComplementar.nome", 70, { min: 2 }), dtNascto: formatarData(ic.dataNascimento) }
        : undefined,
      infoInterm: exigeInterm ? montarInfoInterm(dados.infoInterm, "dadosRemuneracao.infoInterm") : undefined,
    },
    dmDev: demonstrativos.map((dm, i) => montarDmDevRemun(dm, `dadosRemuneracao.demonstrativos[${i}]`, exigeIndApurIR)),
  };

  return montarEnvelope({ raiz: RAIZ_S1200, xmlns: xmlnsEvento(RAIZ_S1200), id, corpo });
}

function formatarPerApur(valor, indApuracao) {
  const texto = String(valor).trim();
  if (indApuracao === 2) {
    if (!/^2\d{3}$/.test(texto)) {
      throw new ErroXmlESocial(`dadosRemuneracao.perApur deve ser "AAAA" quando indApuracao=2 (recebido: "${valor}")`);
    }
    return texto;
  }
  if (!/^\d{4}-\d{2}$/.test(texto)) {
    throw new ErroXmlESocial(`dadosRemuneracao.perApur deve ser "AAAA-MM" quando indApuracao=1 (recebido: "${valor}")`);
  }
  return formatarCompetencia(texto);
}

// infoAgNocivo: "O (se codCateg = [1XX, 2XX, 3XX, 731, 734, 738] ou [4XX] com
// categOrig compatível em S-2300); N (nos demais casos)". categOrig não está no
// S-1200, então para 4XX o grupo é aceito mas não exigido.
function regraAgNocivoS1200(codCateg) {
  const grupo = Math.floor(codCateg / 100);
  if ([1, 2, 3].includes(grupo) || [731, 734, 738].includes(codCateg)) return "obrigatorio";
  if (grupo === 4) return "opcional";
  return "proibido";
}

function montarDmDevRemun(dm, ctx, exigeIndApurIR) {
  exigir(dm, ["ideDmDev", "codCateg"], ctx);
  const codCateg = Number(dm.codCateg);
  if (!Number.isInteger(codCateg) || codCateg < 100 || codCateg > 999) {
    throw new ErroXmlESocial(`${ctx}.codCateg deve ser um código de 3 dígitos da Tabela 01 (recebido: ${dm.codCateg})`);
  }
  const regraAgNocivo = regraAgNocivoS1200(codCateg);

  return {
    ideDmDev: validarTexto(dm.ideDmDev, `${ctx}.ideDmDev`, 30),
    codCateg,
    // infoPerAnt fora do escopo -> infoPerApur obrigatório.
    infoPerApur: {
      ideEstabLot: validarLista(dm.estabelecimentos, `${ctx}.estabelecimentos`, { max: 500 }).map((e, j) => {
        const cE = `${ctx}.estabelecimentos[${j}]`;
        let qtdDiasAv;
        if (e.qtdDiasAvulso != null && e.qtdDiasAvulso !== "") {
          qtdDiasAv = Number(e.qtdDiasAvulso);
          if (!Number.isInteger(qtdDiasAv) || qtdDiasAv < 0 || qtdDiasAv > 31) {
            throw new ErroXmlESocial(`${cE}.qtdDiasAvulso deve ser inteiro de 0 a 31`);
          }
        }
        return {
          ...montarIdeEstabLot(e, cE),
          qtdDiasAv,
          remunPerApur: validarLista(e.remuneracoes, `${cE}.remuneracoes`, { max: 8 }).map((r, k) => {
            const cR = `${cE}.remuneracoes[${k}]`;
            return {
              matricula: r.matricula == null || r.matricula === "" ? undefined : validarTexto(r.matricula, `${cR}.matricula`, 30, { naoBranco: false }),
              indSimples: r.indSimples == null || r.indSimples === "" ? undefined : validarDominio("indSimples", r.indSimples, new Set([1, 2, 3]), cR),
              itensRemun: validarLista(r.rubricas, `${cR}.rubricas`, { max: 200 })
                .map((rub, m) => montarRubrica(rub, `${cR}.rubricas[${m}]`, exigeIndApurIR)),
              infoAgNocivo: montarInfoAgNocivo(r.grauExp, regraAgNocivo, cR),
            };
          }),
        };
      }),
    },
    infoComplCont: montarInfoComplCont(dm.infoComplCont, ctx),
  };
}

function montarInfoComplCont(c, ctx) {
  if (!c) return undefined;
  const cc = `${ctx}.infoComplCont`;
  exigir(c, ["codCBO"], cc);
  const codCBO = soDigitos(c.codCBO);
  if (codCBO.length !== 6) throw new ErroXmlESocial(`${cc}.codCBO deve conter 6 dígitos`);
  let qtdDiasTrab;
  if (c.qtdDiasTrab != null && c.qtdDiasTrab !== "") {
    qtdDiasTrab = Number(c.qtdDiasTrab);
    if (!Number.isInteger(qtdDiasTrab) || qtdDiasTrab < 0 || qtdDiasTrab > 31) {
      throw new ErroXmlESocial(`${cc}.qtdDiasTrab deve ser inteiro de 0 a 31`);
    }
  }
  return {
    codCBO,
    natAtividade: c.natAtividade == null || c.natAtividade === "" ? undefined : validarDominio("natAtividade", c.natAtividade, new Set([1, 2]), cc),
    qtdDiasTrab,
  };
}

// ---------------------------------------------------------------------------
// Registro de eventos + dispatcher genérico
// ---------------------------------------------------------------------------
// Implementados: S-2200 (#375), S-2299 e S-1200 (#648). Os demais códigos
// existem no catálogo (ES-4) mas ainda não têm gerador — ES-7 deve tratar
// isso como "evento não suportado ainda" (não como erro de entrada do usuário).
//
// PRÓXIMAS ITERAÇÕES (cada uma uma task incremental):
//   Grupo 2: S-2205, S-2206, S-2230, S-2298
//   Grupo 3: S-2210, S-2220, S-2240
//   Grupo 4: S-1210, S-1299
// ---------------------------------------------------------------------------

export const EVENTOS = {
  "S-2200": { raiz: RAIZ_S2200, versao: VERSAO_LEIAUTE, gerar: gerarXmlS2200 },
  "S-2299": { raiz: RAIZ_S2299, versao: VERSAO_LEIAUTE, gerar: gerarXmlS2299 },
  "S-1200": { raiz: RAIZ_S1200, versao: VERSAO_LEIAUTE, gerar: gerarXmlS1200 },
};

export function eventoSuportado(codigo) {
  return Object.prototype.hasOwnProperty.call(EVENTOS, codigo);
}

/**
 * Ponto único de entrada para ES-7: recebe o código do evento e os dados,
 * despacha para o gerador certo. Lança ErroXmlESocial se o código existe no
 * catálogo mas ainda não tem gerador.
 */
export function gerarXmlEvento(codigo, ...args) {
  if (!CATALOGO_ESOCIAL[codigo]) {
    throw new ErroXmlESocial(`Código de evento desconhecido: ${codigo}`);
  }
  const entrada = EVENTOS[codigo];
  if (!entrada) {
    throw new ErroXmlESocial(
      `Evento ${codigo} (${CATALOGO_ESOCIAL[codigo].nome}) ainda não tem gerador de XML implementado`,
    );
  }
  return entrada.gerar(...args);
}
