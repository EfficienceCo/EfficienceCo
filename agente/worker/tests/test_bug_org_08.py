"""Regressões BUG-ORG-08 / #486 — Comprovantes com mês + log em arquivo."""

import sys
from datetime import datetime
from pathlib import Path

from core.estrutura_pastas import SUBPASTAS_COM_MES, resolver_destino
from core.log_arquivo import iniciar_log_arquivo


def test_comprovantes_esta_em_subpastas_com_mes():
    assert "Comprovantes" in SUBPASTAS_COM_MES


def test_extrato_bancario_resolve_com_subpasta_mes(tmp_path):
    mes = "2026-09"
    destino = resolver_destino(
        "extrato_bancario", "Padaria Central", str(tmp_path), mes=mes
    )
    assert destino is not None
    assert destino.endswith(str(Path("Padaria Central") / "Comprovantes" / mes))


def test_extrato_bancario_usa_mes_atual_quando_omitido(tmp_path):
    destino = resolver_destino("extrato_bancario", "Padaria", str(tmp_path))
    mes = datetime.now().strftime("%Y-%m")
    assert destino is not None
    assert destino.endswith(mes)


def test_iniciar_log_arquivo_persiste_print(tmp_path):
    log = tmp_path / "worker.log"
    stdout_orig, stderr_orig = sys.stdout, sys.stderr
    try:
        caminho = iniciar_log_arquivo(log)
        assert caminho == log
        print("falha silenciosa detectavel")
        texto = log.read_text(encoding="utf-8")
        assert "falha silenciosa detectavel" in texto
    finally:
        sys.stdout, sys.stderr = stdout_orig, stderr_orig
