"""Testes da gestão de artefatos do classificador (#509) — sem inferência ML."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from automacoes.classificador_documentos import artefatos as art


def _escrever_trio(pasta: Path, conteudo: bytes = b"fake-artefato") -> None:
    pasta.mkdir(parents=True, exist_ok=True)
    for nome in art.ARQUIVOS_OBRIGATORIOS:
        (pasta / nome).write_bytes(conteudo)


def test_destino_respeita_env(tmp_path, monkeypatch):
    alvo = tmp_path / "custom"
    monkeypatch.setenv(art.ENV_ARTEFATOS_DIR, str(alvo))
    assert art.destino_artefatos() == alvo.resolve()


def test_destino_pacote_modelos(tmp_path, monkeypatch):
    monkeypatch.delenv(art.ENV_ARTEFATOS_DIR, raising=False)
    monkeypatch.setenv(art.ENV_PACOTE_DIR, str(tmp_path))
    dest = art.destino_artefatos()
    assert dest == (tmp_path / "modelos" / "classificador_documentos").resolve()


def test_status_faltando_quando_vazio(tmp_path, monkeypatch):
    monkeypatch.setenv(art.ENV_ARTEFATOS_DIR, str(tmp_path))
    st = art.status_artefatos(conferir_hash=False)
    assert st["completo"] is False
    assert set(st["faltando"]) == set(art.ARQUIVOS_OBRIGATORIOS)


def test_instalar_copia_para_destino(tmp_path, monkeypatch):
    fonte = tmp_path / "fonte"
    dest = tmp_path / "dest"
    _escrever_trio(fonte, b"abc")
    monkeypatch.setenv(art.ENV_ARTEFATOS_DIR, str(dest))

    resultado = art.instalar_artefatos(fonte, conferir_hash=True)
    assert resultado["status"]["completo"] is True
    for nome in art.ARQUIVOS_OBRIGATORIOS:
        assert (dest / nome).read_bytes() == b"abc"


def test_instalar_fonte_incompleta_falha(tmp_path):
    fonte = tmp_path / "fonte"
    fonte.mkdir()
    (fonte / "modelo.pt").write_bytes(b"x")
    with pytest.raises(FileNotFoundError, match="Fonte incompleta"):
        art.instalar_artefatos(fonte)


def test_verificar_exige_arquivos(tmp_path, monkeypatch):
    monkeypatch.setenv(art.ENV_ARTEFATOS_DIR, str(tmp_path))
    with pytest.raises(RuntimeError, match="ausentes"):
        art.verificar_artefatos(conferir_hash=False)


def test_hash_divergente_quando_publicado(tmp_path, monkeypatch):
    dest = tmp_path / "dest"
    _escrever_trio(dest, b"conteudo-real")
    monkeypatch.setenv(art.ENV_ARTEFATOS_DIR, str(dest))

    man = art.carregar_manifest()
    man = json.loads(json.dumps(man))
    man["publicado"] = True
    dig = art._sha256_arquivo(dest / "modelo.pt")
    for item in man["arquivos"]:
        item["sha256"] = "0" * 64 if item["nome"] == "modelo.pt" else dig

    st = art.status_artefatos(conferir_hash=True, manifest=man)
    assert "modelo.pt" in st["divergentes"]
    assert st["completo"] is False


def test_manifest_versionado_lista_os_tres_arquivos():
    man = art.carregar_manifest()
    nomes = [a["nome"] for a in man["arquivos"]]
    assert nomes == list(art.ARQUIVOS_OBRIGATORIOS)
    assert man["destino_relativo_pacote"] == "modelos/classificador_documentos"
    assert man["publicado"] is False


def test_cli_status_exit_code(tmp_path, monkeypatch):
    from automacoes.classificador_documentos.instalar_artefatos import main

    monkeypatch.setenv(art.ENV_ARTEFATOS_DIR, str(tmp_path))
    assert main(["--status", "--sem-hash"]) == 2

    _escrever_trio(tmp_path)
    assert main(["--status", "--sem-hash"]) == 0
