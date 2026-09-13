"""Testes do monitor processar_pasta_nfe (lookup backend + POST + arquivamento)."""

import contextlib
import io
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
NOME_EMPRESA = "Padaria do João"
NOME_FORNECEDOR = "Mercado Central"


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


@pytest.fixture
def stdout_cp1252():
    """Stdout que encoda em cp1252 strict — reproduz console Windows PT-BR (BUG-NFE-01)."""
    buf = io.BytesIO()
    stream = io.TextIOWrapper(
        buf, encoding="cp1252", errors="strict", write_through=True, newline="\n"
    )

    @contextlib.contextmanager
    def capturar():
        with contextlib.redirect_stdout(stream):
            yield
        stream.flush()

    def ler() -> str:
        stream.flush()
        return buf.getvalue().decode("cp1252")

    return capturar, ler


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


def _lookup_ambas(cnpj):
    digitos = "".join(c for c in str(cnpj) if c.isdigit())
    if digitos == CNPJ_CLIENTE:
        return NOME_EMPRESA
    if digitos == CNPJ_FORNECEDOR:
        return NOME_FORNECEDOR
    return None


def _arquivo_nfe(base: Path, empresa: str, nome: str) -> Path:
    return base / empresa / "Notas Fiscais" / "2026-07" / nome


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
    tipos = [c.args[1]["tipo"] for c in mock_post.call_args_list]
    assert tipos == ["entrada", "saida"]
    assert not (inbox / "entrada.xml").exists()
    assert _arquivo_nfe(base, NOME_EMPRESA, "entrada.xml").is_file()
    assert _arquivo_nfe(base, NOME_FORNECEDOR, "entrada.xml").is_file()


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
            return_value="Padaria/../outro",
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


def test_cliente_id_ausente_nao_trava_scan(pasta_nfe, monkeypatch):
    inbox, _base = pasta_nfe
    _copiar_fixture("entrada.xml", inbox)
    _copiar_fixture("saida.xml", inbox)
    monkeypatch.setattr("comunicacao.api_client.CLIENTE_ID", "")
    monkeypatch.delenv("CLIENTE_ID", raising=False)

    with (
        patch("automacoes.processar_nfe.buscar_empresa_por_cnpj", side_effect=_lookup_padaria),
        patch("automacoes.processar_nfe.client.post") as mock_post,
    ):
        processar_pasta_nfe(str(inbox))

    mock_post.assert_not_called()
    assert (inbox / "entrada.xml").is_file()
    assert (inbox / "saida.xml").is_file()


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


def test_sucesso_loga_arquivado_sem_falha_em_cp1252(pasta_nfe, stdout_cp1252):
    inbox, base = pasta_nfe
    _copiar_fixture("entrada.xml", inbox)
    capturar, ler = stdout_cp1252

    with (
        patch("automacoes.processar_nfe.buscar_empresa_por_cnpj", side_effect=_lookup_padaria),
        patch("automacoes.processar_nfe.client.post") as mock_post,
    ):
        mock_post.return_value = MagicMock()
        with capturar():
            processar_pasta_nfe(str(inbox))

    log = ler()
    assert "criado" in log
    assert "arquivado" in log
    assert "falha ao arquivar" not in log
    assert _arquivo_nfe(base, NOME_EMPRESA, "entrada.xml").is_file()


def test_nao_identificado_loga_sem_falha_em_cp1252(pasta_nfe, stdout_cp1252):
    inbox, _base = pasta_nfe
    _copiar_fixture("entrada.xml", inbox)
    capturar, ler = stdout_cp1252

    with (
        patch("automacoes.processar_nfe.buscar_empresa_por_cnpj", return_value=None),
        patch("automacoes.processar_nfe.client.post") as mock_post,
    ):
        with capturar():
            processar_pasta_nfe(str(inbox))

    log = ler()
    assert "não identificado" in log
    assert "falha ao mover" not in log
    mock_post.assert_not_called()
    assert (inbox / "nao_identificado" / "entrada.xml").is_file()


def test_processar_nfe_sem_seta_unicode_nos_prints():
    fonte = Path(__file__).resolve().parents[1] / "automacoes" / "processar_nfe.py"
    assert "\u2192" not in fonte.read_text(encoding="utf-8")
