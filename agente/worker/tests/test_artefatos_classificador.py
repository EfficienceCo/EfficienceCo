"""Testes da gestão de artefatos do classificador (#509) — sem inferência ML."""

from __future__ import annotations

import json
import re
import shutil
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
    if man["publicado"]:
        # Publicação (#649): versão real e os 3 hashes preenchidos.
        assert "unpublished" not in man["modelo_version"]
        for item in man["arquivos"]:
            assert re.fullmatch(r"[0-9a-f]{64}", item["sha256"] or ""), item["nome"]
    else:
        assert all(item["sha256"] is None for item in man["arquivos"])


def test_cli_status_exit_code(tmp_path, monkeypatch):
    from automacoes.classificador_documentos.instalar_artefatos import main

    monkeypatch.setenv(art.ENV_ARTEFATOS_DIR, str(tmp_path))
    assert main(["--status", "--sem-hash"]) == 2

    _escrever_trio(tmp_path)
    assert main(["--status", "--sem-hash"]) == 0


# ---------------------------------------------------------------------------
# publicar_manifest (#649)
# ---------------------------------------------------------------------------


def _manifest_temporario(tmp_path: Path) -> Path:
    copia = tmp_path / "manifest.json"
    shutil.copy2(art.MANIFEST_PATH, copia)
    return copia


def test_publicar_preenche_hashes_e_marca_publicado(tmp_path):
    artefatos = tmp_path / "artefatos"
    _escrever_trio(artefatos, b"pesos")
    manifest = _manifest_temporario(tmp_path)
    relatorio = {
        "documentos_por_classe": {"holerite": 12, "contrato_social": 10},
        "metricas": {
            "teste": {
                "limiar": 0.75,
                "acuracia": 0.9,
                "acuracia_com_limiar": 0.8,
                "por_classe": {
                    "contrato_social": {"acuracia_com_limiar": 0.5},
                    "holerite": {"acuracia_com_limiar": 1.0},
                },
            }
        },
    }

    art.publicar_manifest(artefatos, "1.0.0", relatorio=relatorio, caminho_manifest=manifest)

    man = art.carregar_manifest(manifest)
    assert man["publicado"] is True
    assert man["modelo_version"] == "1.0.0"
    assert "nota" not in man
    dig = art._sha256_arquivo(artefatos / "modelo.pt")
    assert {item["sha256"] for item in man["arquivos"]} == {dig}
    assert man["baseline"]["acuracia_teste_por_classe"] == {
        "contrato_social": 0.5,
        "holerite": 1.0,
    }
    # O manifest publicado valida os próprios artefatos.
    assert art.verificar_artefatos(artefatos, manifest=man)["completo"] is True


def test_publicar_sem_artefatos_falha_e_nao_altera_manifest(tmp_path):
    manifest = _manifest_temporario(tmp_path)
    antes = manifest.read_bytes()
    with pytest.raises(FileNotFoundError, match="faltam"):
        art.publicar_manifest(tmp_path / "vazio", "1.0.0", caminho_manifest=manifest)
    assert manifest.read_bytes() == antes


@pytest.mark.parametrize("versao", ["", "0.0.0-unpublished"])
def test_publicar_recusa_versao_invalida(tmp_path, versao):
    artefatos = tmp_path / "artefatos"
    _escrever_trio(artefatos)
    manifest = _manifest_temporario(tmp_path)
    with pytest.raises(ValueError, match="inválida"):
        art.publicar_manifest(artefatos, versao, caminho_manifest=manifest)
