"""Regressão BUG-ORG-07 / #485 — varredura inicial não reprocessa quarentena."""

from unittest.mock import patch

from automacoes.monitorar_pasta import _varredura_inicial
from core.estrutura_pastas import PASTA_NAO_CLASSIFICADO


def test_varredura_inicial_pula_nao_classificado(tmp_path):
    entrada = tmp_path / "entrada"
    quarentena = entrada / PASTA_NAO_CLASSIFICADO
    quarentena.mkdir(parents=True)
    (entrada / "ok.pdf").write_bytes(b"ok")
    (quarentena / "lixo.pdf").write_bytes(b"lixo")

    regras = [
        {
            "ativa": True,
            "pasta_origem": str(entrada),
            "acao": "mover",
            "condicao": {},
        }
    ]
    processados = []

    def fake_processar(caminho, _regras):
        processados.append(caminho)

    with patch("automacoes.monitorar_pasta._processar_arquivo", side_effect=fake_processar):
        _varredura_inicial(regras, str(entrada))

    nomes = [p.split("\\")[-1].split("/")[-1] for p in processados]
    assert nomes == ["ok.pdf"]
