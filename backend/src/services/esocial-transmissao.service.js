// Transmissão SOAP ao eSocial (#ES-8).
// Manual §7.5 EnviarLoteEventos + §7.6 ConsultarLoteEventos.
// Certificado: TLS mútuo (§6.5) + assinatura XML do evento (§6.7).

import soap from "soap";
import { assertUrlPermitida, configESocial } from "../config/esocial-ambiente.config.js";
import { lerCertificadoA1 } from "../utils/esocial-certificado.util.js";
import { assinarXmlEvento } from "../utils/esocial-assinatura.util.js";
import {
  extrairMetadadosEvento,
  montarConsultaLote,
  montarLoteEnvio,
} from "../utils/esocial-lote.util.js";
import {
  parseRetornoEnvio,
  parseRetornoProcessamento,
  ErroRespostaESocial,
} from "../utils/esocial-resposta.util.js";

export class ErroTransmissaoESocial extends Error {
  constructor(mensagem, codigo = "TRANSMISSAO_FALHOU", statusHttp = 502) {
    super(mensagem);
    this.name = "ErroTransmissaoESocial";
    this.codigo = codigo;
    this.statusHttp = statusHttp;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function criarClienteSoap(url, { certificatePem, privateKeyPem }) {
  assertUrlPermitida(url, configESocial);
  const wsdl = `${url}?singleWsdl`;

  const client = await soap.createClientAsync(wsdl, {
    wsdl_options: {
      cert: certificatePem,
      key: privateKeyPem,
      rejectUnauthorized: true,
    },
  });

  client.setSecurity(new soap.ClientSSLSecurity(certificatePem, privateKeyPem));
  return client;
}

async function chamarSoap(client, metodo, payload) {
  const fn = client[`${metodo}Async`];
  if (typeof fn !== "function") {
    throw new ErroTransmissaoESocial(`Método SOAP ${metodo} indisponível no WSDL`);
  }
  const [resultado] = await fn(payload);
  return resultado;
}

function validarTpAmb(meta, tpAmbEsperado) {
  if (meta.tpAmb !== tpAmbEsperado) {
    throw new ErroTransmissaoESocial(
      `XML com tpAmb=${meta.tpAmb}, mas o ambiente configurado exige tpAmb=${tpAmbEsperado}`,
      "TPAMB_DIVERGENTE",
      422,
    );
  }
}

/**
 * Fluxo completo: assinar → enviar lote → consultar processamento → recibo/erro.
 * Material criptográfico existe só durante esta chamada.
 */
export async function transmitirEventoEsocial({
  tipoEvento,
  xmlEvento,
  certificadoBuffer,
  senha,
  config = configESocial,
}) {
  const credencial = lerCertificadoA1(certificadoBuffer, senha);

  const xmlAssinado = assinarXmlEvento(xmlEvento, {
    privateKeyPem: credencial.privateKeyPem,
    certificatePem: credencial.certificatePem,
  });

  const meta = extrairMetadadosEvento(xmlAssinado);
  validarTpAmb(meta, config.tpAmbEsperado);

  const { xmlLote } = montarLoteEnvio({
    tipoEvento,
    xmlEventoAssinado: xmlAssinado,
    transmissor: credencial.transmissor,
  });

  const clientEnvio = await criarClienteSoap(config.urlEnvio, credencial);
  const respostaEnvioBruta = await chamarSoap(clientEnvio, "EnviarLoteEventos", {
    loteEventos: xmlLote,
  });

  const envio = parseRetornoEnvio(respostaEnvioBruta);
  if (!envio.sucesso) {
    throw new ErroTransmissaoESocial(envio.erro, "ENVIO_REJEITADO", 502);
  }

  const clientConsulta = await criarClienteSoap(config.urlConsulta, credencial);
  const xmlConsulta = montarConsultaLote(envio.protocoloEnvio);

  let processamento = null;
  for (let i = 0; i < config.poll.tentativas; i += 1) {
    const respostaConsultaBruta = await chamarSoap(clientConsulta, "ConsultarLoteEventos", {
      consulta: xmlConsulta,
    });
    processamento = parseRetornoProcessamento(respostaConsultaBruta);

    if (processamento.aguardando) {
      await sleep(config.poll.intervaloMs);
      continue;
    }
    break;
  }

  if (!processamento) {
    throw new ErroTransmissaoESocial("Sem resposta de processamento do eSocial", "PROCESSAMENTO_VAZIO");
  }

  if (processamento.aguardando) {
    throw new ErroTransmissaoESocial(
      "Processamento do lote ainda em andamento — tente novamente em instantes",
      "PROCESSAMENTO_PENDENTE",
      502,
    );
  }

  if (processamento.sucesso) {
    return {
      status: "transmitido",
      numero_recibo: processamento.nrRecibo,
      protocoloEnvio: envio.protocoloEnvio,
    };
  }

  return {
    status: "rejeitado",
    erro_rejeicao: processamento.erroEvento ?? processamento.descResposta ?? "Evento rejeitado pelo eSocial",
    protocoloEnvio: envio.protocoloEnvio,
  };
}

export { ErroRespostaESocial };
