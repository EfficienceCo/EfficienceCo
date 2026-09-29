"""Regressões BUG-ORG-08 / #486 — Comprovantes com mês + log em arquivo."""

import sys
from datetime import datetime
from pathlib import Path

from core.estrutura_pastas import SUBPASTAS_COM_MES, resolver_destino
from core.log_arquivo import iniciar_log_arquivo
from core.log_arquivo import _TeeTexto
import io


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
        sys.stdout._arquivo.close()
        sys.stdout, sys.stderr = stdout_orig, stderr_orig


def test_stream_sem_console_retorna_numero_de_caracteres():
    arquivo = io.StringIO()
    stream = _TeeTexto(None, arquivo)
    assert stream.write("ação") == 4
    assert arquivo.getvalue() == "ação"


def test_log_rotaciona_sem_console(tmp_path, monkeypatch):
    monkeypatch.setattr("core.log_arquivo.MAX_LOG_BYTES", 100)
    monkeypatch.setattr("core.log_arquivo.BACKUP_LOGS", 2)
    monkeypatch.setattr(sys, "stdout", None)
    monkeypatch.setattr(sys, "stderr", None)
    log = tmp_path / "worker.log"
    iniciar_log_arquivo(log)
    try:
        for i in range(30):
            print(f"linha {i:02d}: " + "x" * 20)
        arquivos = list(tmp_path.glob("worker.log*"))
        assert len(arquivos) == 3
        assert all(p.stat().st_size <= 100 for p in arquivos)
        assert "linha 29" in log.read_text(encoding="utf-8")
    finally:
        sys.stdout._arquivo.close()
