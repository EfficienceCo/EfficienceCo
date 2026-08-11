"""Testes do monitor processar_pasta_nfe (lookup backend + POST + arquivamento)."""

import shutil
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from comunicacao.api_client import ApiError
from automacoes.processar_nfe import processar_pasta_nfe

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "nfe"
CNPJ_CLIENTE = "12345678000199"
CNPJ_FORNECEDOR = "98765432000110"
CNPJ_OUTRO = "11222333000181"
CLIENTE_ID = "11111111-1111-1111-1111-111111111111"
NOME_EMPRESA = "Padaria do João"


@pytest.fixture
def pasta_nfe(tmp_path, monkeypatch):
    base = tmp_path / "escritorio"
    inbox = base / "NFe"
    inbox.mkdir(parents=True)
    monkeypatch.setenv("PASTA_BASE", str(base))
    monkeypatch.setenv("CLIENTE_ID", CLIENTE_ID)
    monkeypatch.setattr("comunicacao.api_client.CLIENTE_ID", CLIENTE_ID)
    monkeypatch.setattr("comunicacao.api_client.LICENSE_TOKEN", "tok-teste")
    monkeypatch.setattr("comunicacao.api_client.PASTA_BASE", str(base))
    return inbox, base


def _copiar_fixture(nome: str, destino: Path) -> Path:
    src = FIXTURES / nome
    alvo = destino / nome
    shutil.copy(src, alvo)
    return alvo


def _lookup_padaria(cnpj):
    """Simula GET /clientes/por-cnpj: só a Padaria está cadastrada."""
    digitos = "".join(c for c in str(cnpj) if c.isdigit())
    if digitos == CNPJ_CLIENTE:
        return NOME_EMPRESA
    return None


def test_processar_pasta_entrada_posta_e_move(pasta_nfe):
    inbox, base = pasta_nfe
    _copiar_fixture("entrada.xml", inbox)

    with (
        patch("automacoes.processar_nfe.buscar_empresa_por_cnpj", side_effect=_lookup_padaria),
        patch("automacoes.processar_nfe.client.post") as mock_post,
    ):
        mock_post.return_value = MagicMock()
        processar_pasta_nfe(str(inbox))

    assert mock_post.called
    payload = mock_post.call_args.args[1]
    assert payload["tipo"] == "entrada"
    assert payload["chave_nfe"] == "35260712345678000190550010000000011000000011"
    assert payload["cliente_id"] == CLIENTE_ID
    assert payload["valor_total"] == "1500.00"
    assert payload["data_emissao"] == "2026-07-15"
    assert NOME_EMPRESA in payload["arquivo_xml"]
    assert "Fiscal" in payload["arquivo_xml"]

    assert not (inbox / "entrada.xml").exists()
    arquivado = base / NOME_EMPRESA / "Fiscal" / "2026" / "07" / "entrada.xml"
    assert arquivado.is_file()


def test_processar_pasta_saida(pasta_nfe):
    inbox, base = pasta_nfe
    _copiar_fixture("saida.xml", inbox)

    with (
        patch("automacoes.processar_nfe.buscar_empresa_por_cnpj", side_effect=_lookup_padaria),
        patch("automacoes.processar_nfe.client.post") as mock_post,
    ):
        mock_post.return_value = MagicMock()
        processar_pasta_nfe(str(inbox))

    assert mock_post.call_args.args[1]["tipo"] == "saida"
    assert (base / NOME_EMPRESA / "Fiscal" / "2026" / "07" / "saida.xml").is_file()


def test_nao_identificado_move_sem_post(pasta_nfe):
    inbox, _base = pasta_nfe
    _copiar_fixture("entrada.xml", inbox)

    with (
        patch("automacoes.processar_nfe.buscar_empresa_por_cnpj", return_value=None),
        patch("automacoes.processar_nfe.client.post") as mock_post,
    ):
        processar_pasta_nfe(str(inbox))

    mock_post.assert_not_called()
    assert not (inbox / "entrada.xml").exists()
    assert (inbox / "nao_identificado" / "entrada.xml").is_file()


def test_duplicata_409_ainda_move(pasta_nfe):
    inbox, base = pasta_nfe
    _copiar_fixture("entrada.xml", inbox)

    with (
        patch("automacoes.processar_nfe.buscar_empresa_por_cnpj", side_effect=_lookup_padaria),
        patch(
            "automacoes.processar_nfe.client.post",
            side_effect=ApiError(409, "já existe"),
        ),
    ):
        processar_pasta_nfe(str(inbox))

    assert not (inbox / "entrada.xml").exists()
    assert (base / NOME_EMPRESA / "Fiscal" / "2026" / "07" / "entrada.xml").is_file()


def test_xml_invalido_permanece_na_inbox(pasta_nfe):
    inbox, _base = pasta_nfe
    ruim = inbox / "quebrado.xml"
    ruim.write_text("<nfeProc><NFe>", encoding="utf-8")

    with patch("automacoes.processar_nfe.client.post") as mock_post:
        processar_pasta_nfe(str(inbox))

    mock_post.assert_not_called()
    assert ruim.is_file()


def test_erro_api_nao_move(pasta_nfe):
    inbox, base = pasta_nfe
    _copiar_fixture("entrada.xml", inbox)

    with (
        patch("automacoes.processar_nfe.buscar_empresa_por_cnpj", side_effect=_lookup_padaria),
        patch(
            "automacoes.processar_nfe.client.post",
            side_effect=ApiError(500, "falha"),
        ),
    ):
        processar_pasta_nfe(str(inbox))

    assert (inbox / "entrada.xml").is_file()
    assert not (base / NOME_EMPRESA).exists()


def test_sem_pasta_base_nao_processa(pasta_nfe, monkeypatch):
    inbox, _base = pasta_nfe
    _copiar_fixture("entrada.xml", inbox)
    monkeypatch.setattr("comunicacao.api_client.PASTA_BASE", "")
    monkeypatch.delenv("PASTA_BASE", raising=False)

    with patch("automacoes.processar_nfe.client.post") as mock_post:
        processar_pasta_nfe(str(inbox))

    mock_post.assert_not_called()
    assert (inbox / "entrada.xml").is_file()


def test_nao_recursivo_ignora_subpasta(pasta_nfe):
    inbox, _base = pasta_nfe
    sub = inbox / "sub"
    sub.mkdir()
    _copiar_fixture("entrada.xml", sub)

    with (
        patch("automacoes.processar_nfe.buscar_empresa_por_cnpj", side_effect=_lookup_padaria),
        patch("automacoes.processar_nfe.client.post") as mock_post,
    ):
        processar_pasta_nfe(str(inbox))

    mock_post.assert_not_called()
    assert (sub / "entrada.xml").is_file()
