"""Certificado de teste e assinatura de XML de NF-e (NFE-8)."""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID, ObjectIdentifier
from signxml import DigestAlgorithm, SignatureMethod

from automacoes.nfe_assinatura import assinar_nfe_xml

_OID_CNPJ = ObjectIdentifier("2.16.76.1.3.3")
_OID_CPF = ObjectIdentifier("2.16.76.1.3.1")
_RE_EMIT = re.compile(
    r"<emit>\s*<(CNPJ|CPF)>\s*([^<]+)\s*</\1>",
    re.IGNORECASE | re.DOTALL,
)


def _digitos(valor: str) -> str:
    return "".join(c for c in valor if c in "0123456789")


def documento_emitente_xml(xml: str) -> str:
    m = _RE_EMIT.search(xml)
    if not m:
        raise ValueError("emitente sem CNPJ/CPF no XML de teste")
    so = _digitos(m.group(2))
    if m.group(1).upper() == "CNPJ" and len(so) == 14:
        return so
    if m.group(1).upper() == "CPF" and len(so) == 11:
        return so
    raise ValueError("emitente sem CNPJ/CPF no XML de teste")


def _der_printable(texto: str) -> bytes:
    data = texto.encode("ascii")
    if len(data) >= 128:
        raise ValueError("DER PrintableString longo demais")
    return bytes([0x13, len(data)]) + data


def gerar_certificado_teste(
    documento: str,
    *,
    not_before: datetime | None = None,
    not_after: datetime | None = None,
    incluir_oid_subject: bool = True,
    incluir_san: bool = True,
):
    """Par (chave, certificado) autoassinado com CNPJ/CPF no SAN e/ou no subject."""
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    agora = datetime.now(timezone.utc)
    oid = _OID_CNPJ if len(documento) == 14 else _OID_CPF
    rdn = [x509.NameAttribute(NameOID.COMMON_NAME, "Certificado teste ICP")]
    if incluir_oid_subject:
        rdn.extend(
            [
                x509.NameAttribute(NameOID.SERIAL_NUMBER, documento),
                x509.NameAttribute(oid, documento),
            ]
        )
    subject = x509.Name(rdn)
    builder = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(subject)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(not_before or (agora - timedelta(days=1)))
        .not_valid_after(not_after or (agora + timedelta(days=365)))
    )
    if incluir_san:
        builder = builder.add_extension(
            x509.SubjectAlternativeName([x509.OtherName(oid, _der_printable(documento))]),
            critical=False,
        )
    return key, builder.sign(key, hashes.SHA256())


@lru_cache(maxsize=16)
def _certificado_cache(documento: str):
    return gerar_certificado_teste(documento)


def assinar_xml_nfe(
    xml: str,
    *,
    documento_cert: str | None = None,
    key=None,
    cert=None,
    not_before: datetime | None = None,
    not_after: datetime | None = None,
    incluir_oid_subject: bool = True,
    incluir_san: bool = True,
    signature_algorithm: SignatureMethod = SignatureMethod.RSA_SHA256,
    digest_algorithm: DigestAlgorithm = DigestAlgorithm.SHA256,
) -> str:
    """Assina o XML com um certificado cujo CNPJ/CPF é o do emitente, salvo override."""
    if key is None or cert is None:
        documento = documento_cert or documento_emitente_xml(xml)
        customizado = (
            not_before is not None
            or not_after is not None
            or not incluir_oid_subject
            or not incluir_san
        )
        if customizado:
            key, cert = gerar_certificado_teste(
                documento,
                not_before=not_before,
                not_after=not_after,
                incluir_oid_subject=incluir_oid_subject,
                incluir_san=incluir_san,
            )
        else:
            key, cert = _certificado_cache(documento)
    return assinar_nfe_xml(
        xml,
        key=key,
        cert=cert,
        signature_algorithm=signature_algorithm,
        digest_algorithm=digest_algorithm,
    )


def gravar_nfe_assinada(destino: Path, xml: str, **kwargs) -> Path:
    destino.write_text(assinar_xml_nfe(xml, **kwargs), encoding="utf-8")
    return destino
