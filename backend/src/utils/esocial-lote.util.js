// Montagem do lote EnvioLoteEventos (#ES-8).
// Manual §7.5.9 — schema EnvioLoteEventos S-1.3 (v1_3_0).

import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { create } from "xmlbuilder2";
import { soDigitos } from "./esocial-xml.util.js";
import { grupoLoteParaEvento } from "./esocial-grupo-lote.util.js";

export const VERSAO_LOTE = "v1_3_0";
export const NS_ENVIO_LOTE = `http://www.esocial.gov.br/schema/lote/eventos/envio/${VERSAO_LOTE}`;
export const NS_CONSULTA_LOTE = `http://www.esocial.gov.br/schema/lote/eventos/envio/consulta/retornoProcessamento/${VERSAO_LOTE}`;

export class ErroLoteESocial extends Error {
  constructor(mensagem, codigo = "LOTE_INVALIDO") {
    super(mensagem);
    this.name = "ErroLoteESocial";
    this.codigo = codigo;
  }
}

function extrairTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, "i");
  const match = xml.match(re);
  return match ? match[1].trim() : null;
}

/** Extrai ideEmpregador, tpAmb e Id do XML do evento (pré ou pós-assinatura). */
export function extrairMetadadosEvento(xmlEvento) {
  const blocoEmpregador = xmlEvento.match(/<ideEmpregador>[\s\S]*?<\/ideEmpregador>/i)?.[0] ?? "";
  const tpInsc = Number(extrairTag(blocoEmpregador, "tpInsc"));
  const nrInsc = soDigitos(extrairTag(blocoEmpregador, "nrInsc"));

  const blocoIdeEvento = xmlEvento.match(/<ideEvento>[\s\S]*?<\/ideEvento>/i)?.[0] ?? "";
  const tpAmb = Number(extrairTag(blocoIdeEvento, "tpAmb"));

  const idMatch = xmlEvento.match(/<evt[A-Za-z0-9]+[^>]*\bId="(ID[^"]+)"/);
  const id = idMatch ? idMatch[1] : null;

  if (!tpInsc || !nrInsc || !id) {
    throw new ErroLoteESocial("XML do evento sem ideEmpregador ou Id");
  }

  return { tpInsc, nrInsc, tpAmb, id };
}

function nrInscEmpregadorNoLote(tpInsc, nrInsc) {
  if (tpInsc === 1) return nrInsc.slice(0, 8);
  return nrInsc.slice(0, 11);
}

/**
 * Monta XML do lote com um evento assinado embutido.
 */
export function montarLoteEnvio({ tipoEvento, xmlEventoAssinado, transmissor }) {
  const meta = extrairMetadadosEvento(xmlEventoAssinado);
  const grupo = grupoLoteParaEvento(tipoEvento);

  const eventoDoc = new DOMParser().parseFromString(xmlEventoAssinado, "text/xml");
  const eventoInner = eventoDoc.documentElement;

  const arvore = {
    eSocial: {
      "@xmlns": NS_ENVIO_LOTE,
      envioLoteEventos: {
        "@grupo": String(grupo),
        ideEmpregador: {
          tpInsc: meta.tpInsc,
          nrInsc: nrInscEmpregadorNoLote(meta.tpInsc, meta.nrInsc),
        },
        ideTransmissor: {
          tpInsc: transmissor.tpInsc,
          nrInsc:
            transmissor.tpInsc === 1
              ? transmissor.nrInsc.slice(0, 14)
              : transmissor.nrInsc.slice(0, 11),
        },
        evento: {
          "@Id": meta.id,
        },
      },
    },
  };

  let xmlLote = create({ version: "1.0", encoding: "UTF-8" }, arvore).end({ prettyPrint: false });

  const loteDoc = new DOMParser().parseFromString(xmlLote, "text/xml");
  const tagEvento = loteDoc.getElementsByTagName("evento")[0];
  if (!tagEvento) throw new ErroLoteESocial("Falha ao montar tag evento do lote");

  tagEvento.appendChild(loteDoc.importNode(eventoInner, true));
  xmlLote = new XMLSerializer().serializeToString(loteDoc);

  return { xmlLote, meta, grupo };
}

/** Monta XML de consulta ao resultado do processamento (Manual §7.6.9). */
export function montarConsultaLote(protocoloEnvio) {
  const arvore = {
    eSocial: {
      "@xmlns": NS_CONSULTA_LOTE,
      consultaLoteEventos: {
        protocoloEnvio,
      },
    },
  };
  return create({ version: "1.0", encoding: "UTF-8" }, arvore).end({ prettyPrint: false });
}
