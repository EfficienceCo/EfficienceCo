// ---------------------------------------------------------------------------
// Gerador de XML de eventos do eSocial — leiaute S-1.3 (NT 06/2026).
//
// Escopo desta task (#375 / ES-6): implementar SÓ o S-2200 (Admissão), que é o
// evento mais complexo (40+ campos, o schema muda conforme a categoria do
// trabalhador). O objetivo é fixar o PADRÃO que os outros 11 eventos vão seguir.
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
// PONTOS A CONFIRMAR CONTRA O XSD S-1.3 na validação manual (não deu pra
// fechar sem o schema oficial em mãos):
//   - ordem de <codMunic>/<uf> dentro de <nascimento> (aqui: após paisNac);
//   - ordem <nmFuncao> vs <CBOFuncao> em infoContrato;
//   - forma do grupo <FGTS> (aqui só <dtOpcFGTS>; layouts antigos tinham
//     <opcFGTS>) e se o grupo é obrigatório p/ celetista;
//   - se <horContratual> é mesmo minOccurs=1 também p/ estatutário.
// ---------------------------------------------------------------------------

import { create } from "xmlbuilder2";
import { CATALOGO_ESOCIAL } from "./esocial-catalogo.util.js";

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
const CATEGORIAS_ESTATUTARIAS = new Set([301, 302, 303, 306, 307, 309, 310, 312, 314]);
const TP_INSC_EMPREGADOR = new Set([1, 2]);
const TP_INSC_LOCAL_GERAL = new Set([1, 3, 4]);
const TP_INSC_ESTAB_VINC = new Set([1, 2]);
const TP_JORNADA = new Set([2, 3, 4, 5, 6, 7, 9]);
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

/** Remove tudo que não for dígito (CPF, CNPJ, CEP, telefone). */
export function soDigitos(valor) {
  if (valor === null || valor === undefined) return "";
  return String(valor).replace(/\D+/g, "");
}

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
 *     naturalidade: { codMunicipio, uf }  // obrigatório se nascido no Brasil,
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
 *     tpAdmissao, tpRegJor, natAtividade, dtBase?, cnpjSindCategProf?,
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

  const ambiente = dadosAdmissao.ambiente === "producao" ? TP_AMB.PRODUCAO : TP_AMB.HOMOLOGACAO;
  const tpInsc = validarDominio("tpInsc", dadosAdmissao.empregador.tpInsc, TP_INSC_EMPREGADOR, "dadosAdmissao.empregador");
  const nrInsc = validarNumeroInscricao(
    tpInsc,
    dadosAdmissao.empregador.nrInsc,
    "dadosAdmissao.empregador",
    { 1: [8, 14], 2: [11] },
  );

  const id = gerarIdEvento({
    tpInsc,
    nrInsc,
    dataHora: dadosAdmissao.dataHoraGeracao ?? new Date(),
    sequencial: dadosAdmissao.sequencial ?? 1,
  });

  const corpo = {
    ideEvento: {
      indRetif: 1, // 1 = evento original (retificação é fora do escopo do sprint)
      tpAmb: ambiente,
      procEmi: PROC_EMI_APP_EMPREGADOR,
      verProc: verProcValido(dadosAdmissao.verProc),
    },
    ideEmpregador: {
      tpInsc,
      nrInsc: tpInsc === 1 ? nrInsc.slice(0, 8) : nrInsc,
    },
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
    cpfTrab: soDigitos(f.cpf),
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

function montarNascimento(f) {
  const paisNascto = f.paisNascimento || "105";
  const nascimento = {
    dtNascto: formatarData(f.dataNascimento),
    paisNascto,
    paisNac: f.paisNacionalidade || "105",
  };
  // codMunic + uf (naturalidade) são obrigatórios quando paisNascto = 105.
  if (paisNascto === "105") {
    exigir(f, ["naturalidade.codMunicipio", "naturalidade.uf"], "funcionario.naturalidade");
    nascimento.codMunic = Number(f.naturalidade.codMunicipio);
    nascimento.uf = f.naturalidade.uf;
  } else if (f.naturalidade) {
    nascimento.codMunic = f.naturalidade.codMunicipio ? Number(f.naturalidade.codMunicipio) : undefined;
    nascimento.uf = f.naturalidade.uf;
  }
  return nascimento;
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
    cpfDep: d.cpf ? soDigitos(d.cpf) : undefined,
    sexoDep: d.sexo,
    depIRRF: sn(d.depIRRF),
    depSF: sn(d.depSF),
    incTrab: sn(d.incTrab),
    descrDep: d.descricao,
  };
}

function montarInfoCeletista(dados, codCateg) {
  exigir(dados, ["dataAdmissao", "tpAdmissao", "tpRegJor", "natAtividade"], "dadosAdmissao (celetista)");
  if (codCateg === 106) exigir(dados, ["trabalhadorTemporario"], "dadosAdmissao (trabalhador temporario)");
  const tpRegJor = validarDominio("tpRegJor", dados.tpRegJor, new Set([1, 2, 3, 4]), "dadosAdmissao");
  return {
    dtAdm: formatarData(dados.dataAdmissao),
    tpAdmissao: Number(dados.tpAdmissao),
    // Opcional no XSD (só relevante em transferência/sucessão). Sem default
    // silencioso — se não vier, sai do XML e o eSocial aplica o próprio padrão.
    indAdmissao: dados.indAdmissao != null && dados.indAdmissao !== "" ? Number(dados.indAdmissao) : undefined,
    tpRegJor,
    natAtividade: Number(dados.natAtividade),
    dtBase: dados.dtBase ? Number(dados.dtBase) : undefined,
    cnpjSindCategProf: dados.cnpjSindCategProf ? soDigitos(dados.cnpjSindCategProf) : undefined,
    FGTS: dados.fgts ? { dtOpcFGTS: formatarData(dados.fgts.dataOpcao) } : undefined,
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
    ideTrabSubstituido: substituidos.map((cpf) => ({ cpfTrabSubst: soDigitos(cpf) })),
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
// Registro de eventos + dispatcher genérico
// ---------------------------------------------------------------------------
// Só S-2200 está implementado nesta task. Os outros 11 códigos existem no
// catálogo (ES-4) mas ainda não têm gerador — ES-7 deve tratar isso como
// "evento não suportado ainda" (não como erro de entrada do usuário).
//
// PRÓXIMAS ITERAÇÕES (fora de #375, cada uma uma task incremental):
//   Grupo 2: S-2205, S-2206, S-2230, S-2298, S-2299
//   Grupo 3: S-2210, S-2220, S-2240
//   Grupo 4: S-1200, S-1210, S-1299
// ---------------------------------------------------------------------------

export const EVENTOS = {
  "S-2200": { raiz: RAIZ_S2200, versao: VERSAO_LEIAUTE, gerar: gerarXmlS2200 },
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
