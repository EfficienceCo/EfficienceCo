"""NFE-8: conferência da assinatura digital do XML."""

from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from automacoes.nfe_assinatura import validar_assinatura_nfe
from automacoes.processar_nfe import parsear_nfe, processar_pasta_nfe
from signxml import DigestAlgorithm, SignatureMethod

from helpers_nfe_assinatura import assinar_xml_nfe, gerar_certificado_teste, gravar_nfe_assinada

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "nfe"
CNPJ_CLIENTE = "12345678000199"
CNPJ_FORNECEDOR = "98765432000110"
CNPJ_OUTRO = "11222333000181"
CLIENTE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
NOME_EMPRESA = "Padaria do João"


@pytest.fixture(autouse=True)
def _sem_pasta_base(monkeypatch):
    monkeypatch.delenv("PASTA_BASE", raising=False)
    monkeypatch.setattr("comunicacao.api_client.PASTA_BASE", "")


def _entrada_xml() -> str:
    return (FIXTURES / "entrada.xml").read_text(encoding="utf-8")


def test_nota_assinada_integra_entra(tmp_path):
    caminho = gravar_nfe_assinada(tmp_path / "ok.xml", _entrada_xml())
    dados = parsear_nfe(str(caminho))
    assert dados["valor_total"] == Decimal("1500.00")
    assert dados["cnpj_emitente"] == CNPJ_FORNECEDOR


def test_vnf_alterado_depois_de_assinada_recusa(tmp_path):
    assinado = assinar_xml_nfe(_entrada_xml())
    adulterado = assinado.replace(">1500.00<", ">9999.00<", 1)
    caminho = tmp_path / "adulterada.xml"
    caminho.write_text(adulterado, encoding="utf-8")
    with pytest.raises(ValueError, match="adulterada"):
        parsear_nfe(str(caminho))


def test_infnfe_falso_fora_do_nfe_assinado_recusa(tmp_path):
    assinado = assinar_xml_nfe(_entrada_xml())
    inicio = assinado.index("<infNFe")
    falso = assinado[inicio : assinado.index("</infNFe>") + len("</infNFe>")].replace(
        ">1500.00<", ">9999.00<", 1
    )
    adulterado = assinado.replace("<NFe>", f"<extra>{falso}</extra><NFe>", 1)
    caminho = tmp_path / "infnfe-falso.xml"
    caminho.write_text(adulterado, encoding="utf-8")
    with pytest.raises(ValueError, match="adulterada"):
        parsear_nfe(str(caminho))


def test_sem_signature_recusa(tmp_path):
    caminho = tmp_path / "sem-sig.xml"
    caminho.write_text(_entrada_xml(), encoding="utf-8")
    with pytest.raises(ValueError, match="sem assinatura digital"):
        parsear_nfe(str(caminho))


def test_certificado_de_outro_emitente_recusa(tmp_path):
    caminho = gravar_nfe_assinada(
        tmp_path / "outro-cert.xml",
        _entrada_xml(),
        documento_cert=CNPJ_OUTRO,
    )
    with pytest.raises(ValueError, match="não pertence ao emitente"):
        parsear_nfe(str(caminho))


def test_certificado_vencido_depois_da_emissao_nao_recusa(tmp_path):
    caminho = gravar_nfe_assinada(
        tmp_path / "vencido.xml",
        _entrada_xml(),
        not_before=datetime(2018, 1, 1, tzinfo=timezone.utc),
        not_after=datetime(2020, 1, 1, tzinfo=timezone.utc),
    )
    dados = parsear_nfe(str(caminho))
    assert dados["cnpj_emitente"] == CNPJ_FORNECEDOR


def test_pasta_sem_assinatura_vai_para_nao_identificado(tmp_path, monkeypatch):
    base = tmp_path / "escritorio"
    inbox = base / "NFe"
    inbox.mkdir(parents=True)
    monkeypatch.setenv("PASTA_BASE", str(base))
    monkeypatch.setenv("CLIENTE_ID", CLIENTE_ID)
    monkeypatch.setattr("comunicacao.api_client.CLIENTE_ID", CLIENTE_ID)
    monkeypatch.setattr("comunicacao.api_client.LICENSE_TOKEN", "tok-teste")
    monkeypatch.setattr("comunicacao.api_client.PASTA_BASE", str(base))
    (inbox / "entrada.xml").write_text(_entrada_xml(), encoding="utf-8")

    with (
        patch("automacoes.processar_nfe.buscar_empresa_por_cnpj", return_value={"id": CLIENTE_ID, "nome": NOME_EMPRESA}),
        patch("automacoes.processar_nfe.client.post") as mock_post,
    ):
        mock_post.return_value = MagicMock()
        processar_pasta_nfe(str(inbox))

    mock_post.assert_not_called()
    assert (inbox / "nao_identificado" / "entrada.xml").is_file()


def test_validar_assinatura_direto_no_arquivo_assinado(tmp_path):
    caminho = gravar_nfe_assinada(tmp_path / "ok.xml", _entrada_xml())
    validar_assinatura_nfe(str(caminho))


def test_certificado_so_com_cnpj_no_san_entra(tmp_path):
    """A1 ICP-Brasil declara o CNPJ no SAN/otherName, não no subject."""
    caminho = gravar_nfe_assinada(
        tmp_path / "san.xml",
        _entrada_xml(),
        incluir_oid_subject=False,
        incluir_san=True,
    )
    dados = parsear_nfe(str(caminho))
    assert dados["cnpj_emitente"] == CNPJ_FORNECEDOR


def test_assinatura_rsa_sha1_entra(tmp_path):
    """NF-e 4.00 real ainda assina com rsa-sha1; SHA-256 também."""
    caminho = gravar_nfe_assinada(
        tmp_path / "sha1.xml",
        _entrada_xml(),
        signature_algorithm=SignatureMethod.RSA_SHA1,
        digest_algorithm=DigestAlgorithm.SHA1,
    )
    dados = parsear_nfe(str(caminho))
    assert dados["valor_total"] == Decimal("1500.00")


def test_certificado_sem_cnpj_nem_cpf_recusa(tmp_path):
    key, cert = gerar_certificado_teste(
        CNPJ_FORNECEDOR, incluir_oid_subject=False, incluir_san=False
    )
    caminho = gravar_nfe_assinada(
        tmp_path / "sem-doc.xml", _entrada_xml(), key=key, cert=cert
    )
    with pytest.raises(ValueError, match="não pertence ao emitente"):
        parsear_nfe(str(caminho))
