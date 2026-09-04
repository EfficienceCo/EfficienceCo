// Parser das respostas SOAP/XML do eSocial (#ES-8).
// Manual §7.5.10 (RetornoEnvioLoteEventos) e §7.6.10 (RetornoProcessamentoLote).

export const CD_ENVIO_SUCESSO = new Set([201, 202]);
export const CD_ENVIO_AGUARDANDO = new Set([203]);
export const CD_PROCESSAMENTO_AGUARDANDO = 101;
export const CD_PROCESSAMENTO_SUCESSO = new Set([201, 202]);
export const CD_EVENTO_SUCESSO = new Set([201, 202]);

export class ErroRespostaESocial extends Error {
  constructor(mensagem, codigo = "RESPOSTA_GOV_INVALIDA") {
    super(mensagem);
    this.name = "ErroRespostaESocial";
    this.codigo = codigo;
  }
}

function normalizarXmlEntrada(valor) {
  if (!valor) return "";
  if (typeof valor === "string") return valor;
  if (typeof valor === "object") {
    if (valor.$value) return String(valor.$value);
    if (valor._) return String(valor._);
    return JSON.stringify(valor);
  }
  return String(valor);
}

/** Extrai XML de resposta de diferentes formatos retornados pelo cliente SOAP. */
export function extrairXmlResposta(resultado) {
  if (!resultado) return "";
  if (typeof resultado === "string") return resultado;

  const candidatos = [
    resultado,
    resultado.EnviarLoteEventosResult,
    resultado.ConsultarLoteEventosResult,
    resultado.envelope,
    resultado.body,
  ];

  for (const item of candidatos) {
    const xml = normalizarXmlEntrada(item);
    if (xml.includes("<eSocial") || xml.includes("<retorno")) return xml;
  }

  const serializado = JSON.stringify(resultado);
  const match = serializado.match(/<eSocial[\s\S]*<\/eSocial>/);
  return match ? match[0] : serializado;
}

function extrairTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i");
  const match = xml.match(re);
  return match ? match[1].trim() : null;
}

function extrairOcorrencias(xml) {
  const ocorrencias = [];
  const re = /<ocorrencia[^>]*>[\s\S]*?<codigo>([^<]*)<\/codigo>[\s\S]*?<descricao>([^<]*)<\/descricao>[\s\S]*?<\/ocorrencia>/gi;
  let match;
  while ((match = re.exec(xml))) {
    ocorrencias.push({ codigo: match[1].trim(), descricao: match[2].trim() });
  }
  return ocorrencias;
}

function formatarErro(ocorrencias, descResposta) {
  if (ocorrencias.length) {
    return ocorrencias.map((o) => `${o.codigo}: ${o.descricao}`).join("; ");
  }
  return descResposta ?? "Rejeitado pelo eSocial";
}

/** Interpreta RetornoEnvioLoteEventos (Manual §7.5.10). */
export function parseRetornoEnvio(xmlBruto) {
  const xml = extrairXmlResposta(xmlBruto);
  const cdResposta = Number(extrairTag(xml, "cdResposta"));
  const descResposta = extrairTag(xml, "descResposta");
  const protocoloEnvio = extrairTag(xml, "protocoloEnvio");
  const ocorrencias = extrairOcorrencias(xml);

  if (!cdResposta) {
    throw new ErroRespostaESocial("Resposta de envio do eSocial sem cdResposta");
  }

  return {
    cdResposta,
    descResposta,
    protocoloEnvio,
    ocorrencias,
    sucesso: CD_ENVIO_SUCESSO.has(cdResposta) && Boolean(protocoloEnvio),
    aguardando: CD_ENVIO_AGUARDANDO.has(cdResposta),
    erro: formatarErro(ocorrencias, descResposta),
  };
}

function extrairNrRecibo(xml) {
  const direto = extrairTag(xml, "nrRecibo");
  if (direto) return direto;

  const bloco = xml.match(/<recibo>[\s\S]*?<nrRecibo>([^<]+)<\/nrRecibo>[\s\S]*?<\/recibo>/i);
  return bloco ? bloco[1].trim() : null;
}

/** Interpreta RetornoProcessamentoLote (Manual §7.6.10 / §8.6). */
export function parseRetornoProcessamento(xmlBruto) {
  const xml = extrairXmlResposta(xmlBruto);
  const cdResposta = Number(extrairTag(xml, "cdResposta"));
  const descResposta = extrairTag(xml, "descResposta");
  const ocorrencias = extrairOcorrencias(xml);

  if (!cdResposta) {
    throw new ErroRespostaESocial("Resposta de processamento do eSocial sem cdResposta");
  }

  const aguardando = cdResposta === CD_PROCESSAMENTO_AGUARDANDO;
  const loteOk = CD_PROCESSAMENTO_SUCESSO.has(cdResposta);

  let nrRecibo = null;
  let cdEvento = null;
  let erroEvento = null;

  const blocoEvento = xml.match(/<retornoEvento>[\s\S]*?<\/retornoEvento>/i)?.[0] ?? xml;
  cdEvento = Number(extrairTag(blocoEvento, "cdResposta"));
  nrRecibo = extrairNrRecibo(blocoEvento);

  if (cdEvento && !CD_EVENTO_SUCESSO.has(cdEvento)) {
    erroEvento = formatarErro(extrairOcorrencias(blocoEvento), extrairTag(blocoEvento, "descResposta"));
  }

  const sucesso = loteOk && cdEvento && CD_EVENTO_SUCESSO.has(cdEvento) && Boolean(nrRecibo);

  return {
    cdResposta,
    descResposta,
    ocorrencias,
    aguardando,
    sucesso,
    nrRecibo,
    cdEvento,
    erroEvento: erroEvento ?? (loteOk ? null : formatarErro(ocorrencias, descResposta)),
  };
}

export function sanitizarErroHttp(err) {
  if (err instanceof ErroRespostaESocial) return err.message;
  if (err?.codigo === "CERTIFICADO_INVALIDO") return "Certificado inválido ou senha incorreta";
  return "Falha na comunicação com o eSocial";
}
