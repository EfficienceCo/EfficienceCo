// Parse de certificado A1 (.pfx/.p12) em memória (#ES-8).
// Manual §6.6 / §7.4 — certificado e-CPF/e-CNPJ ICP-Brasil, série A.
// Nunca logar senha, buffer do PFX nem conteúdo PEM completo.

import forge from "node-forge";

export class ErroCertificadoESocial extends Error {
  constructor(mensagem, codigo = "CERTIFICADO_INVALIDO") {
    super(mensagem);
    this.name = "ErroCertificadoESocial";
    this.codigo = codigo;
  }
}

const OID_CPF = "2.16.76.1.3.2";
const OID_CNPJ = "2.16.76.1.3.3";

function extrairInscricaoDeSubject(cert) {
  const attrs = cert.subject?.attributes ?? [];
  for (const attr of attrs) {
    const valor = String(attr.value ?? "");
    const cnpj = valor.match(/\d{14}/);
    if (cnpj) return { tpInsc: 1, nrInsc: cnpj[0] };
    const cpf = valor.match(/\d{11}/);
    if (cpf) return { tpInsc: 2, nrInsc: cpf[0] };
  }
  return null;
}

function extrairInscricaoDeExtensao(cert) {
  const ext = cert.getExtension?.("subjectAltName");
  if (!ext?.altNames) return null;

  for (const alt of ext.altNames) {
    if (alt.type !== 0 || !Array.isArray(alt.value)) continue;
    for (const part of alt.value) {
      const oid = part.type;
      const bytes = part.value;
      if (!bytes) continue;

      let texto = "";
      if (typeof bytes === "string") {
        texto = bytes;
      } else if (bytes.data) {
        texto = forge.util.decodeUtf8(bytes.data);
      }

      const digitos = texto.replace(/\D+/g, "");
      if (oid === OID_CNPJ && digitos.length >= 14) {
        return { tpInsc: 1, nrInsc: digitos.slice(0, 14) };
      }
      if (oid === OID_CPF && digitos.length >= 11) {
        return { tpInsc: 2, nrInsc: digitos.slice(0, 11) };
      }
    }
  }
  return null;
}

export function extrairInscricaoTransmissor(cert) {
  return extrairInscricaoDeExtensao(cert) ?? extrairInscricaoDeSubject(cert);
}

/**
 * Lê PFX/P12 da memória e devolve credenciais TLS + assinatura.
 * Descartar referências após uso — nada é persistido.
 */
export function lerCertificadoA1(buffer, senha) {
  if (!buffer?.length) {
    throw new ErroCertificadoESocial("Arquivo de certificado ausente ou vazio");
  }
  if (!senha) {
    throw new ErroCertificadoESocial("Senha do certificado é obrigatória");
  }

  let p12;
  try {
    const der = forge.util.createBuffer(buffer.toString("binary"));
    const asn1 = forge.asn1.fromDer(der);
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, senha);
  } catch {
    throw new ErroCertificadoESocial("Certificado inválido ou senha incorreta");
  }

  const certBags =
    p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
  const keyBags =
    p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
      forge.pki.oids.pkcs8ShroudedKeyBag
    ] ??
    p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ??
    [];

  const cert = certBags[0]?.cert;
  const privateKey = keyBags[0]?.key;

  if (!cert || !privateKey) {
    throw new ErroCertificadoESocial("Certificado A1 incompleto (sem chave ou certificado)");
  }

  const agora = new Date();
  if (agora < cert.validity.notBefore || agora > cert.validity.notAfter) {
    throw new ErroCertificadoESocial("Certificado digital fora do período de validade", "CERTIFICADO_EXPIRADO");
  }

  const transmissor = extrairInscricaoTransmissor(cert);
  if (!transmissor) {
    throw new ErroCertificadoESocial(
      "Não foi possível identificar CPF/CNPJ no certificado (e-CPF/e-CNPJ esperado)",
    );
  }

  return {
    certificatePem: forge.pki.certificateToPem(cert),
    privateKeyPem: forge.pki.privateKeyToPem(privateKey),
    transmissor,
    validade: {
      inicio: cert.validity.notBefore.toISOString(),
      fim: cert.validity.notAfter.toISOString(),
    },
  };
}
