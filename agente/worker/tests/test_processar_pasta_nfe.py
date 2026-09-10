"""Testes do monitor processar_pasta_nfe (lookup backend + POST + arquivamento)."""

import shutil
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from comunicacao.api_client import ApiError
from automacoes.processar_nfe import processar_pasta_nfe
from core.estrutura_pastas import SUBPASTAS

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "nfe"
CNPJ_CLIENTE = "12345678000199"
CNPJ_FORNECEDOR = "98765432000110"
# Licença do agente = Padaria (dest nas notas de entrada / emit nas de saída).
CLIENTE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
CLIENTE_ID_EMIT = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
NOME_EMPRESA = "Padaria do João"
NOME_FORNECEDOR = "Mercado Central"
CHAVE_DOIS_CLIENTES = "35261298765432000110550010000000031000000033"


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
    """Simula GET /clientes/por-cnpj scoped: só a Padaria (licença) resolve."""
    digitos = "".join(c for c in str(cnpj) if c.isdigit())
    if digitos == CNPJ_CLIENTE:
        return {"id": CLIENTE_ID, "nome": NOME_EMPRESA}
    return None


def _lookup_ambas_unscoped(cnpj):
    """Simula API sem escopo (defesa do agente ainda filtra pela licença)."""
    digitos = "".join(c for c in str(cnpj) if c.isdigit())
    if digitos == CNPJ_CLIENTE:
        return {"id": CLIENTE_ID, "nome": NOME_EMPRESA}
    if digitos == CNPJ_FORNECEDOR:
        return {"id": CLIENTE_ID_EMIT, "nome": NOME_FORNECEDOR}
    return None


def _lookup_emitente_licenca(cnpj):
    """Licença = Mercado (emitente): só o emit resolve."""
    digitos = "".join(c for c in str(cnpj) if c.isdigit())
    if digitos == CNPJ_FORNECEDOR:
        return {"id": CLIENTE_ID_EMIT, "nome": NOME_FORNECEDOR}
    return None


def _lookup_sem_id(cnpj):
    digitos = "".join(c for c in str(cnpj) if c.isdigit())
    if digitos == CNPJ_CLIENTE:
        return {"nome": NOME_EMPRESA}
    return None


def _arquivo_nfe(base: Path, empresa: str, nome: str, mes: str = "2026-07") -> Path:
    return base / empresa / "Notas Fiscais" / mes / nome


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
    assert "Notas Fiscais" in payload["arquivo_xml"]

    assert not (inbox / "entrada.xml").exists()
    arquivado = _arquivo_nfe(base, NOME_EMPRESA, "entrada.xml")
    assert arquivado.is_file()
    for sub in SUBPASTAS:
        assert (base / NOME_EMPRESA / sub).is_dir()


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
    assert mock_post.call_args.args[1]["cliente_id"] == CLIENTE_ID
    assert _arquivo_nfe(base, NOME_EMPRESA, "saida.xml").is_file()


def test_intra_escritorio_posta_so_tenant_da_licenca(pasta_nfe):
    """Mesmo se o lookup devolver 2 empresas, só posta o cliente_id da licença."""
    inbox, base = pasta_nfe
    _copiar_fixture("entrada.xml", inbox)

    with (
        patch(
            "automacoes.processar_nfe.buscar_empresa_por_cnpj",
            side_effect=_lookup_ambas_unscoped,
        ),
        patch("automacoes.processar_nfe.client.post") as mock_post,
    ):
        mock_post.return_value = MagicMock()
        processar_pasta_nfe(str(inbox))

    assert mock_post.call_count == 1
    payload = mock_post.call_args.args[1]
    assert payload["tipo"] == "entrada"
    assert payload["cliente_id"] == CLIENTE_ID
    assert not (inbox / "entrada.xml").exists()
    assert _arquivo_nfe(base, NOME_EMPRESA, "entrada.xml").is_file()
    assert not _arquivo_nfe(base, NOME_FORNECEDOR, "entrada.xml").exists()


def test_dois_clientes_licenca_dest_posta_entrada(pasta_nfe):
    inbox, base = pasta_nfe
    _copiar_fixture("dois-clientes.xml", inbox)

    with (
        patch("automacoes.processar_nfe.buscar_empresa_por_cnpj", side_effect=_lookup_padaria),
        patch("automacoes.processar_nfe.client.post") as mock_post,
    ):
        mock_post.return_value = MagicMock()
        processar_pasta_nfe(str(inbox))

    assert mock_post.call_count == 1
    payload = mock_post.call_args.args[1]
    assert payload["tipo"] == "entrada"
    assert payload["cliente_id"] == CLIENTE_ID
    assert payload["chave_nfe"] == CHAVE_DOIS_CLIENTES
    assert not (inbox / "dois-clientes.xml").exists()
    assert _arquivo_nfe(base, NOME_EMPRESA, "dois-clientes.xml", mes="2026-12").is_file()


def test_dois_clientes_licenca_emit_posta_saida(pasta_nfe, monkeypatch):
    inbox, base = pasta_nfe
    monkeypatch.setenv("CLIENTE_ID", CLIENTE_ID_EMIT)
    monkeypatch.setattr("comunicacao.api_client.CLIENTE_ID", CLIENTE_ID_EMIT)
    _copiar_fixture("dois-clientes.xml", inbox)

    with (
        patch(
            "automacoes.processar_nfe.buscar_empresa_por_cnpj",
            side_effect=_lookup_emitente_licenca,
        ),
        patch("automacoes.processar_nfe.client.post") as mock_post,
    ):
        mock_post.return_value = MagicMock()
        processar_pasta_nfe(str(inbox))

    assert mock_post.call_count == 1
    payload = mock_post.call_args.args[1]
    assert payload["tipo"] == "saida"
    assert payload["cliente_id"] == CLIENTE_ID_EMIT
    assert payload["chave_nfe"] == CHAVE_DOIS_CLIENTES
    assert _arquivo_nfe(base, NOME_FORNECEDOR, "dois-clientes.xml", mes="2026-12").is_file()


def test_dois_clientes_reprocesso_idempotente(pasta_nfe):
    inbox, base = pasta_nfe
    _copiar_fixture("dois-clientes.xml", inbox)

    with (
        patch("automacoes.processar_nfe.buscar_empresa_por_cnpj", side_effect=_lookup_padaria),
        patch("automacoes.processar_nfe.client.post") as mock_post,
    ):
        mock_post.return_value = MagicMock()
        processar_pasta_nfe(str(inbox))

    assert mock_post.call_count == 1
    assert not (inbox / "dois-clientes.xml").exists()

    _copiar_fixture("dois-clientes.xml", inbox)
    with (
        patch("automacoes.processar_nfe.buscar_empresa_por_cnpj", side_effect=_lookup_padaria),
        patch(
            "automacoes.processar_nfe.client.post",
            side_effect=ApiError(409, "já existe"),
        ) as mock_post2,
    ):
        processar_pasta_nfe(str(inbox))

    assert mock_post2.call_count == 1
    assert not (inbox / "dois-clientes.xml").exists()
    pasta_dest = base / NOME_EMPRESA / "Notas Fiscais" / "2026-12"
    assert any(pasta_dest.glob("dois-clientes*.xml"))


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


def test_nome_empresa_invalido_nao_posta(pasta_nfe):
    inbox, _base = pasta_nfe
    _copiar_fixture("entrada.xml", inbox)

    with (
        patch(
            "automacoes.processar_nfe.buscar_empresa_por_cnpj",
            return_value={"id": CLIENTE_ID, "nome": "Padaria/../outro"},
        ),
        patch("automacoes.processar_nfe.client.post") as mock_post,
    ):
        processar_pasta_nfe(str(inbox))

    mock_post.assert_not_called()
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
    assert _arquivo_nfe(base, NOME_EMPRESA, "entrada.xml").is_file()


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
    assert not _arquivo_nfe(base, NOME_EMPRESA, "entrada.xml").exists()


def test_cliente_id_ausente_nao_trava_scan(pasta_nfe):
    """Lookup sem id → trata como não identificado; scan continua."""
    inbox, _base = pasta_nfe
    _copiar_fixture("entrada.xml", inbox)
    _copiar_fixture("saida.xml", inbox)

    with (
        patch("automacoes.processar_nfe.buscar_empresa_por_cnpj", side_effect=_lookup_sem_id),
        patch("automacoes.processar_nfe.client.post") as mock_post,
    ):
        processar_pasta_nfe(str(inbox))

    mock_post.assert_not_called()
    assert (inbox / "nao_identificado" / "entrada.xml").is_file()
    assert (inbox / "nao_identificado" / "saida.xml").is_file()


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
