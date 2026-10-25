"""Conferência da assinatura XML-DSig da NF-e (NFE-8 / #662).

A SEFAZ assina o `NFe` (bloco `infNFe`) antes de envelopar em `nfeProc`. A
verificação extrai o `NFe` e confere o XML-DSig com o certificado embutido
em `Signature/KeyInfo` — sem cadeia ICP-Brasil e sem recusar certificado
já vencido (a validade na emissão fica a cargo do protocolo, NFE-1).
"""

from __future__ import annotations

import base64
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import serialization
from cryptography.x509.oid import ExtensionOID, NameOID, ObjectIdentifier
from lxml import etree
from signxml import (
    CanonicalizationMethod,
    DigestAlgorithm,
    SignatureConfiguration,
    SignatureMethod,
    XMLSigner,
    XMLVerifier,
    methods,
)

NS_NFE = "http://www.portalfiscal.inf.br/nfe"
NS_DS = "http://www.w3.org/2000/09/xmldsig#"
_ASCII_DIGITS = "0123456789"
# ICP-Brasil: CNPJ da PJ e CPF da PF (DOC-ICP-04). No A1 real o usual é SAN/otherName.
_OID_CNPJ = ObjectIdentifier("2.16.76.1.3.3")
_OID_CPF = ObjectIdentifier("2.16.76.1.3.1")
# DER: UTF8String, PrintableString, IA5String, GraphicString, VisibleString, BMPString, OCTET STRING.
_DER_STRING_TAGS = frozenset({0x04, 0x0C, 0x13, 0x16, 0x19, 0x1A, 0x1E})

_MSG_SEM_ASSINATURA = "NF-e sem assinatura digital"
_MSG_INVALIDA = "assinatura digital da NF-e inválida ou adulterada"
_MSG_CERT_EMITENTE = "certificado da assinatura não pertence ao emitente"


def _parser() -> etree.XMLParser:
    return etree.XMLParser(resolve_entities=False, no_network=True, huge_tree=False)


def _nome_local(elemento: etree._Element) -> str:
    return etree.QName(elemento).localname


def _somente_digitos(valor: str) -> str:
    return "".join(c for c in valor if c in _ASCII_DIGITS)


def _elemento_nfe(raiz: etree._Element) -> etree._Element | None:
    if _nome_local(raiz) == "NFe":
        return raiz
    return raiz.find(f".//{{{NS_NFE}}}NFe")


def _assinatura(nfe: etree._Element) -> etree._Element | None:
    sig = nfe.find(f"{{{NS_DS}}}Signature")
    if sig is not None:
        return sig
    return nfe.find(f".//{{{NS_DS}}}Signature")


def _texto(pai: etree._Element, caminho: str) -> str:
    el = pai.find(caminho)
    return (el.text or "").strip() if el is not None else ""


def _documento_emitente(nfe: etree._Element) -> str:
    inf = nfe.find(f".//{{{NS_NFE}}}infNFe")
    if inf is None:
        return ""
    cnpj = _somente_digitos(_texto(inf, f"{{{NS_NFE}}}emit/{{{NS_NFE}}}CNPJ"))
    if len(cnpj) == 14:
        return cnpj
    cpf = _somente_digitos(_texto(inf, f"{{{NS_NFE}}}emit/{{{NS_NFE}}}CPF"))
    if len(cpf) == 11:
        return cpf
    return ""


def _ascii_visivel(data: bytes) -> str:
    return "".join(chr(b) for b in data if 32 <= b < 127)


def _texto_der_string(value: bytes) -> str:
    """Conteúdo de um OtherName DER (tag + tamanho curto + payload) ou ASCII visível."""
    if not value:
        return ""
    if value[0] in _DER_STRING_TAGS and len(value) >= 2 and value[1] < 0x80:
        fim = 2 + value[1]
        if fim <= len(value):
            return _ascii_visivel(value[2:fim])
    return _ascii_visivel(value)


def _cnpj_ou_cpf_de_texto(texto: str, *, oid: ObjectIdentifier | None = None) -> str:
    digitos = _somente_digitos(texto)
    if oid == _OID_CNPJ and len(digitos) >= 14:
        return digitos[:14]
    if oid == _OID_CPF:
        # e-CPF: YYYYMMDD (8) + CPF (11) + NIS + RG… (DOC-ICP-04).
        if len(texto) >= 19 and _somente_digitos(texto[8:19]) == texto[8:19]:
            return texto[8:19]
        if len(digitos) >= 19:
            return digitos[8:19]
        if len(digitos) == 11:
            return digitos
        return ""
    if len(digitos) == 14:
        return digitos
    if len(digitos) == 11:
        return digitos
    return ""


def _documento_do_san(cert: x509.Certificate) -> str:
    """CNPJ/CPF no SAN/otherName — o lugar canônico do A1 ICP-Brasil.

    Espelha `extrairInscricaoDeExtensao` de backend/src/utils/esocial-certificado.util.js.
    """
    try:
        ext = cert.extensions.get_extension_for_oid(ExtensionOID.SUBJECT_ALTERNATIVE_NAME)
    except x509.ExtensionNotFound:
        return ""
    cnpj = ""
    cpf = ""
    for name in ext.value:
        if not isinstance(name, x509.OtherName):
            continue
        extraido = _cnpj_ou_cpf_de_texto(_texto_der_string(name.value), oid=name.type_id)
        if name.type_id == _OID_CNPJ and len(extraido) == 14:
            return extraido
        if name.type_id == _OID_CPF and len(extraido) == 11:
            cpf = extraido
        elif not cnpj and len(extraido) == 14:
            cnpj = extraido
        elif not cpf and len(extraido) == 11:
            cpf = extraido
    return cnpj or cpf


def _documento_do_subject(cert: x509.Certificate) -> str:
    """Fallback: OID ICP no DN, serialNumber, ou 14/11 dígitos em qualquer RDN (CN `EMPRESA:CNPJ`)."""
    cnpj = ""
    cpf = ""
    for attr in cert.subject:
        extraido = _cnpj_ou_cpf_de_texto(attr.value, oid=attr.oid)
        if attr.oid == _OID_CNPJ and len(extraido) == 14:
            return extraido
        if attr.oid == _OID_CPF and len(extraido) == 11:
            return extraido
        if attr.oid == NameOID.SERIAL_NUMBER:
            if len(extraido) == 14:
                cnpj = extraido
            elif len(extraido) == 11 and not cpf:
                cpf = extraido
            continue
        if not cnpj and len(extraido) == 14:
            cnpj = extraido
        if not cpf and len(extraido) == 11:
            cpf = extraido
    return cnpj or cpf


def _documento_do_certificado(cert: x509.Certificate) -> str:
    """CNPJ (14) ou CPF (11) declarado no certificado ICP-Brasil / de teste."""
    return _documento_do_san(cert) or _documento_do_subject(cert)


def _certificado_da_assinatura(nfe: etree._Element) -> x509.Certificate:
    el = nfe.find(f".//{{{NS_DS}}}X509Certificate")
    if el is None or not (el.text or "").strip():
        raise ValueError(_MSG_SEM_ASSINATURA)
    try:
        der = base64.b64decode("".join((el.text or "").split()), validate=True)
        return x509.load_der_x509_certificate(der)
    except (ValueError, TypeError) as e:
        raise ValueError(_MSG_INVALIDA) from e


def _config_verificacao(cert: x509.Certificate) -> SignatureConfiguration:
    # SHA-1 entra: NF-e 4.00 real ainda assina com rsa-sha1. SHA-256 também.
    # verification_time no início da validade: certificado vencido *depois*
    # da emissão não recusa (João, 2026-10-12). A SEFAZ já conferiu na
    # autorização (NFE-1).
    return SignatureConfiguration(
        require_x509=True,
        location=".//",
        expect_references=1,
        signature_methods=frozenset(SignatureMethod),
        digest_algorithms=frozenset(DigestAlgorithm),
        verification_time=cert.not_valid_before_utc,
        default_reference_c14n_method=CanonicalizationMethod.CANONICAL_XML_1_0,
    )


def _nfe_standalone(nfe: etree._Element) -> etree._Element:
    return etree.fromstring(etree.tostring(nfe), parser=_parser())


def validar_assinatura_nfe(caminho_xml: str) -> None:
    """Confere Signature do NFe. ValueError se ausente, inválida ou de outro emitente."""
    try:
        xml_bytes = Path(caminho_xml).read_bytes()
    except OSError as e:
        raise ValueError(f"falha ao ler XML: {e}") from e

    try:
        doc = etree.fromstring(xml_bytes, parser=_parser())
    except etree.XMLSyntaxError as e:
        raise ValueError(f"XML malformado: {e}") from e

    nfe = _elemento_nfe(doc)
    if nfe is None or _assinatura(nfe) is None:
        raise ValueError(_MSG_SEM_ASSINATURA)

    # processar_nfe lê o primeiro infNFe do arquivo; só um, dentro do NFe conferido,
    # senão a assinatura vale para uma nota e os campos vêm de outra.
    tag_inf = f"{{{NS_NFE}}}infNFe"
    if len(list(doc.iter(tag_inf))) != 1 or len(list(nfe.iter(tag_inf))) != 1:
        raise ValueError(_MSG_INVALIDA)

    standalone = _nfe_standalone(nfe)
    cert = _certificado_da_assinatura(standalone)
    emitente = _documento_emitente(standalone)
    documento_cert = _documento_do_certificado(cert)
    if not documento_cert or documento_cert != emitente:
        raise ValueError(_MSG_CERT_EMITENTE)

    try:
        resultado = XMLVerifier().verify(
            standalone,
            x509_cert=cert,
            validate_schema=False,
            id_attribute="Id",
            expect_config=_config_verificacao(cert),
        )
    except Exception as e:
        raise ValueError(_MSG_INVALIDA) from e

    if isinstance(resultado, list):
        if not resultado:
            raise ValueError(_MSG_INVALIDA)
        assinado = resultado[0].signed_xml
    else:
        assinado = resultado.signed_xml
    if assinado is None or _nome_local(assinado) != "infNFe":
        raise ValueError(_MSG_INVALIDA)


class _XMLSignerTeste(XMLSigner):
    """Libera SHA-1 só na geração de fixture: NF-e 4.00 real ainda assina com rsa-sha1."""

    def check_deprecated_methods(self):
        return


def _pem_chave(key) -> bytes:
    if isinstance(key, (bytes, str)):
        return key if isinstance(key, bytes) else key.encode("ascii")
    return key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption(),
    )


def _pem_cert(cert) -> bytes:
    if isinstance(cert, (bytes, str)):
        return cert if isinstance(cert, bytes) else cert.encode("ascii")
    return cert.public_bytes(serialization.Encoding.PEM)


def assinar_nfe_xml(
    xml: str | bytes,
    *,
    key,
    cert,
    signature_algorithm: SignatureMethod = SignatureMethod.RSA_SHA256,
    digest_algorithm: DigestAlgorithm = DigestAlgorithm.SHA256,
) -> str:
    """Assina o NFe (perfil SEFAZ: enveloped, C14N 1.0, referência ao infNFe/@Id).

    Uso de teste / dataset. O worker de produção só verifica.
    """
    xml_bytes = xml.encode("utf-8") if isinstance(xml, str) else xml
    doc = etree.fromstring(xml_bytes, parser=_parser())
    nfe = _elemento_nfe(doc)
    if nfe is None:
        raise ValueError("tag NFe não encontrada para assinar")
    inf = nfe.find(f".//{{{NS_NFE}}}infNFe")
    if inf is None or not inf.get("Id"):
        raise ValueError("infNFe/@Id ausente para assinar")

    standalone = _nfe_standalone(nfe)
    signer = _XMLSignerTeste(
        method=methods.enveloped,
        signature_algorithm=signature_algorithm,
        digest_algorithm=digest_algorithm,
        c14n_algorithm=CanonicalizationMethod.CANONICAL_XML_1_0,
    )
    assinado = signer.sign(
        standalone,
        key=_pem_chave(key),
        cert=_pem_cert(cert),
        reference_uri="#" + inf.get("Id"),
        id_attribute="Id",
    )
    pai = nfe.getparent()
    if pai is None:
        doc = assinado
    else:
        pai.replace(nfe, assinado)
    return etree.tostring(doc, xml_declaration=True, encoding="UTF-8").decode("utf-8")
