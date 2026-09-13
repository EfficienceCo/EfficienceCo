// Gera certificado A1 de teste (PFX em memória) — só para testes unitários.
import forge from "node-forge";

export function gerarPfxTeste({
  senha = "senha-teste",
  cnpj = "12345678000195",
  validadeDias = 365,
} = {}) {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setDate(cert.validity.notAfter.getDate() + validadeDias);

  const attrs = [
    { name: "commonName", value: `EMPRESA TESTE LTDA:${cnpj}` },
    { name: "countryName", value: "BR" },
    { shortName: "OU", value: "Certificado PJ A1", type: "utf8String" },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(
    keys.privateKey,
    [cert],
    senha,
    { generateLocalKeyId: true, friendlyName: "cert-teste" },
  );

  const der = forge.asn1.toDer(p12Asn1).getBytes();
  return {
    buffer: Buffer.from(der, "binary"),
    senha,
    cnpj,
    certificatePem: forge.pki.certificateToPem(cert),
    privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
  };
}

export function gerarPfxExpirado({ senha = "senha-teste" } = {}) {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "02";
  cert.validity.notBefore = new Date(Date.now() - 86400000 * 400);
  cert.validity.notAfter = new Date(Date.now() - 86400000 * 30);
  const attrs = [{ name: "commonName", value: "EXPIRADO:12345678000195" }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], senha, {
    generateLocalKeyId: true,
  });
  return {
    buffer: Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), "binary"),
    senha,
  };
}
