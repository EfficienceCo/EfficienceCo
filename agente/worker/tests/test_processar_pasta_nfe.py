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
CLIENTE_ID = "11111111-1111-1111-1111-111111111111"
CLIENTE_ID_DEST = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
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
    """Simula GET /clientes/por-cnpj: só a Padaria está cadastrada."""
    digitos = "".join(c for c in str(cnpj) if c.isdigit())
    if digitos == CNPJ_CLIENTE:
        return {"id": CLIENTE_ID_DEST, "nome": NOME_EMPRESA}
    return None


def _lookup_ambas(cnpj):
    digitos = "".join(c for c in str(cnpj) if c.isdigit())
    if digitos == CNPJ_CLIENTE:
        return {"id": CLIENTE_ID_DEST, "nome": NOME_EMPRESA}
    if digitos == CNPJ_FORNECEDOR:
        return {"id": CLIENTE_ID_EMIT, "nome": NOME_FORNECEDOR}
    return None


def _lookup_sem_id(cnpj):
    """Lookup devolve nome mas sem id — payload não pode ser montado."""
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
    assert payload["cliente_id"] == CLIENTE_ID_DEST
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
    assert mock_post.call_args.args[1]["cliente_id"] == CLIENTE_ID_DEST
    assert _arquivo_nfe(base, NOME_EMPRESA, "saida.xml").is_file()


def test_intra_escritorio_posta_entrada_e_saida(pasta_nfe):
    inbox, base = pasta_nfe
    _copiar_fixture("entrada.xml", inbox)

    with (
        patch("automacoes.processar_nfe.buscar_empresa_por_cnpj", side_effect=_lookup_ambas),
        patch("automacoes.processar_nfe.client.post") as mock_post,
    ):
        mock_post.return_value = MagicMock()
        processar_pasta_nfe(str(inbox))

    assert mock_post.call_count == 2
    payloads = [c.args[1] for c in mock_post.call_args_list]
    tipos = [p["tipo"] for p in payloads]
    assert tipos == ["entrada", "saida"]
    assert payloads[0]["cliente_id"] == CLIENTE_ID_DEST
    assert payloads[1]["cliente_id"] == CLIENTE_ID_EMIT
    assert payloads[0]["cliente_id"] != payloads[1]["cliente_id"]
    assert not (inbox / "entrada.xml").exists()
    assert _arquivo_nfe(base, NOME_EMPRESA, "entrada.xml").is_file()
    assert _arquivo_nfe(base, NOME_FORNECEDOR, "entrada.xml").is_file()


def test_dois_clientes_dois_lancamentos_tenant_e_tipo(pasta_nfe):
    inbox, base = pasta_nfe
    _copiar_fixture("dois-clientes.xml", inbox)

    with (
        patch("automacoes.processar_nfe.buscar_empresa_por_cnpj", side_effect=_lookup_ambas),
        patch("automacoes.processar_nfe.client.post") as mock_post,
    ):
        mock_post.return_value = MagicMock()
        processar_pasta_nfe(str(inbox))

    assert mock_post.call_count == 2
    payloads = [c.args[1] for c in mock_post.call_args_list]
    por_tipo = {p["tipo"]: p for p in payloads}

    assert set(por_tipo) == {"entrada", "saida"}
    assert por_tipo["entrada"]["cliente_id"] == CLIENTE_ID_DEST
    assert por_tipo["saida"]["cliente_id"] == CLIENTE_ID_EMIT
    assert por_tipo["entrada"]["chave_nfe"] == CHAVE_DOIS_CLIENTES
    assert por_tipo["saida"]["chave_nfe"] == CHAVE_DOIS_CLIENTES
    # Env CLIENTE_ID não deve vazar no payload quando o lookup traz IDs próprios.
    assert CLIENTE_ID not in {p["cliente_id"] for p in payloads}

    assert not (inbox / "dois-clientes.xml").exists()
    assert _arquivo_nfe(base, NOME_EMPRESA, "dois-clientes.xml", mes="2026-12").is_file()
    assert _arquivo_nfe(base, NOME_FORNECEDOR, "dois-clientes.xml", mes="2026-12").is_file()


def test_dois_clientes_reprocesso_idempotente(pasta_nfe):
    inbox, base = pasta_nfe
    _copiar_fixture("dois-clientes.xml", inbox)

    with (
        patch("automacoes.processar_nfe.buscar_empresa_por_cnpj", side_effect=_lookup_ambas),
        patch("automacoes.processar_nfe.client.post") as mock_post,
    ):
        mock_post.return_value = MagicMock()
        processar_pasta_nfe(str(inbox))

    assert mock_post.call_count == 2
    assert not (inbox / "dois-clientes.xml").exists()

    # Reprocesso: XML de volta no inbox; API responde 409 nos dois tenants.
    _copiar_fixture("dois-clientes.xml", inbox)
    with (
        patch("automacoes.processar_nfe.buscar_empresa_por_cnpj", side_effect=_lookup_ambas),
        patch(
            "automacoes.processar_nfe.client.post",
            side_effect=ApiError(409, "já existe"),
        ) as mock_post2,
    ):
        processar_pasta_nfe(str(inbox))

    assert mock_post2.call_count == 2
    assert not (inbox / "dois-clientes.xml").exists()
    # Arquivo ainda arquivado (com sufixo se colidir).
    pasta_dest = base / NOME_EMPRESA / "Notas Fiscais" / "2026-12"
    pasta_emit = base / NOME_FORNECEDOR / "Notas Fiscais" / "2026-12"
    assert any(pasta_dest.glob("dois-clientes*.xml"))
    assert any(pasta_emit.glob("dois-clientes*.xml"))


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
            return_value={"id": CLIENTE_ID_DEST, "nome": "Padaria/../outro"},
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
