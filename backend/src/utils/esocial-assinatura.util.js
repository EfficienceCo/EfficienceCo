// Assinatura XML-DSig dos eventos eSocial (#ES-8).
// Manual §6.7 / §8.4: Enveloped, RSA-SHA256, SHA-256, C14N, EndCertOnly.

import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { SignedXml } from "xml-crypto";

const ALG_SIG = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
const ALG_DIGEST = "http://www.w3.org/2001/04/xmlenc#sha256";
const ALG_C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const TRANSFORM_ENVELOPED = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";

export class ErroAssinaturaESocial extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = "ErroAssinaturaESocial";
  }
}

function localizarElementoEvento(doc) {
  const raiz = doc.documentElement;
  if (!raiz) throw new ErroAssinaturaESocial("XML do evento sem elemento raiz");

  for (let i = 0; i < raiz.childNodes.length; i += 1) {
    const node = raiz.childNodes[i];
    if (node.nodeType === 1 && node.getAttribute?.("Id")) {
      return node;
    }
  }
  throw new ErroAssinaturaESocial("XML do evento sem elemento com atributo Id");
}

/**
 * Assina o evento dentro do envelope <eSocial> e devolve o XML completo assinado.
 */
export function assinarXmlEvento(xmlEvento, { privateKeyPem, certificatePem }) {
  const doc = new DOMParser().parseFromString(xmlEvento, "text/xml");
  const parseError = doc.getElementsByTagName("parsererror");
  if (parseError.length) {
    throw new ErroAssinaturaESocial("XML do evento malformado");
  }

  const elementoEvento = localizarElementoEvento(doc);
  const id = elementoEvento.getAttribute("Id");
  if (!id) throw new ErroAssinaturaESocial("Evento sem atributo Id");

  const xmlInterno = new XMLSerializer().serializeToString(elementoEvento);

  const signed = new SignedXml({
    privateKey: privateKeyPem,
    publicCert: certificatePem,
  });
  signed.signatureAlgorithm = ALG_SIG;
  signed.canonicalizationAlgorithm = ALG_C14N;

  signed.addReference({
    xpath: `//*[@Id='${id}']`,
    transforms: [TRANSFORM_ENVELOPED, ALG_C14N],
    digestAlgorithm: ALG_DIGEST,
    uri: `#${id}`,
  });

  signed.computeSignature(xmlInterno, {
    location: { reference: `//*[@Id='${id}']`, action: "append" },
  });

  const assinado = signed.getSignedXml();
  const docAssinado = new DOMParser().parseFromString(assinado, "text/xml");
  const raiz = doc.documentElement;

  while (raiz.firstChild) raiz.removeChild(raiz.firstChild);
  raiz.appendChild(doc.importNode(docAssinado.documentElement, true));

  return new XMLSerializer().serializeToString(doc);
}
