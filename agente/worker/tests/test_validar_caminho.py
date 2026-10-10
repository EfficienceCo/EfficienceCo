"""Regressões #638 / QA-A A1 — validar_caminho case-insensitive no Windows."""

import sys
from unittest.mock import patch

import pytest

from automacoes.monitorar_pasta import _processar_arquivo
from core.utils import validar_caminho


@pytest.mark.skipif(sys.platform != "win32", reason="normcase só altera case no Windows")
def test_validar_caminho_aceita_case_diferente_da_pasta_base(monkeypatch):
    """PASTA_BASE=C:\\Souza + path normcased c:\\souza\\… deve ser válido."""
    monkeypatch.setenv("PASTA_BASE", r"C:\Souza")
    validar_caminho(r"c:\souza\entrada\x.pdf")


def test_validar_caminho_rejeita_fora_da_base(monkeypatch):
    monkeypatch.setenv("PASTA_BASE", r"C:\Souza")
    with pytest.raises(ValueError, match="Caminho fora da PASTA_BASE"):
        validar_caminho(r"C:\Outro\arquivo.pdf")


def test_validar_caminho_rejeita_prefixo_parcial(monkeypatch):
    """C:\\SouzaExtra não é filho de C:\\Souza."""
    monkeypatch.setenv("PASTA_BASE", r"C:\Souza")
    with pytest.raises(ValueError, match="Caminho fora da PASTA_BASE"):
        validar_caminho(r"C:\SouzaExtra\x.pdf")


def test_validar_caminho_sem_pasta_base_nao_valida(monkeypatch):
    monkeypatch.delenv("PASTA_BASE", raising=False)
    validar_caminho(r"C:\qualquer\lugar\arquivo.pdf")


def test_processar_arquivo_captura_value_error_sem_derrubar(tmp_path, capsys):
    """ValueError de path (ex.: fora da base) loga e não propaga — mesmo padrão do RuntimeError."""
    entrada = tmp_path / "entrada"
    entrada.mkdir()
    arquivo = entrada / "x.pdf"
    arquivo.write_bytes(b"%PDF")

    regras = [
        {
            "ativa": True,
            "pasta_origem": str(entrada),
            "acao": "organizar_arquivo",
            "condicao": {},
        }
    ]

    with (
        patch(
            "automacoes.monitorar_pasta.organizar_arquivo",
            side_effect=ValueError("Caminho fora da PASTA_BASE: x.pdf"),
        ),
        patch("automacoes.monitorar_pasta.reportar_evento") as reportar,
    ):
        _processar_arquivo(str(arquivo), regras)

    out = capsys.readouterr().out
    assert "Falha ao processar: x.pdf" in out
    assert "Caminho fora da PASTA_BASE" in out
    reportar.assert_called_once()
    assert reportar.call_args[0][1] is False
