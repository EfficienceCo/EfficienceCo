"""Gestão dos artefatos treinados do classificador (TF-IDF + MLP).

Contrato (ata 2026-09-07 / BUG-ML-01 / #509):
- Treinar uma vez; distribuir só modelo.pt + *.joblib; cliente só consulta.
- Produção: arquivos via no pacote do launcher em modelos/classificador_documentos/.
- QA / worker sem instalador: copiar na mão (script instalar_artefatos).

Os pesos NÃO vão no git (gitignore). O manifest.json versionado descreve o que
deve existir e, após publicação, os SHA-256 esperados.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
MANIFEST_PATH = BASE_DIR / "manifest.json"

ARQUIVOS_OBRIGATORIOS = (
    "modelo.pt",
    "vetorizador.joblib",
    "indice_para_rotulo.joblib",
)

ENV_ARTEFATOS_DIR = "CLASSIFICADOR_ARTEFATOS_DIR"
ENV_PACOTE_DIR = "EFFICIENCE_PACOTE_DIR"


def carregar_manifest(caminho: Path | None = None) -> dict:
    path = caminho or MANIFEST_PATH
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _dir_pacote_sugerido() -> Path | None:
    """Pasta Efficience/ do instalador (ao lado do launcher / exe do worker)."""
    env = os.environ.get(ENV_PACOTE_DIR)
    if env:
        return Path(env).expanduser().resolve()

    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent

    return None


def destino_artefatos(
    preferencia: str | Path | None = None,
    *,
    criar: bool = False,
) -> Path:
    """Resolve o diretório canônico dos 3 artefatos.

    Ordem:
    1. argumento explícito / preferencia
    2. env CLASSIFICADOR_ARTEFATOS_DIR
    3. <pacote>/modelos/classificador_documentos (launcher / exe)
    4. diretório deste módulo (dev / install manual no tree)
    """
    if preferencia is not None:
        dest = Path(preferencia).expanduser().resolve()
    elif os.environ.get(ENV_ARTEFATOS_DIR):
        dest = Path(os.environ[ENV_ARTEFATOS_DIR]).expanduser().resolve()
    else:
        pacote = _dir_pacote_sugerido()
        if pacote is not None:
            dest = (pacote / "modelos" / "classificador_documentos").resolve()
        else:
            dest = BASE_DIR

    if criar:
        dest.mkdir(parents=True, exist_ok=True)
    return dest


def _sha256_arquivo(caminho: Path) -> str:
    h = hashlib.sha256()
    with open(caminho, "rb") as f:
        for bloco in iter(lambda: f.read(1024 * 1024), b""):
            h.update(bloco)
    return h.hexdigest()


def status_artefatos(
    diretorio: str | Path | None = None,
    *,
    conferir_hash: bool = True,
    manifest: dict | None = None,
) -> dict:
    """Inventário dos artefatos: presentes, faltando, hashes divergentes."""
    dest = destino_artefatos(diretorio)
    man = manifest if manifest is not None else carregar_manifest()
    esperados = {
        item["nome"]: item.get("sha256")
        for item in man.get("arquivos", [])
        if item.get("obrigatorio", True)
    }
    for nome in ARQUIVOS_OBRIGATORIOS:
        esperados.setdefault(nome, None)

    presentes = []
    faltando = []
    hashes = {}
    divergentes = []

    for nome, sha_esperado in esperados.items():
        path = dest / nome
        if not path.is_file():
            faltando.append(nome)
            continue
        presentes.append(nome)
        if conferir_hash:
            dig = _sha256_arquivo(path)
            hashes[nome] = dig
            if sha_esperado and dig.lower() != str(sha_esperado).lower():
                divergentes.append(nome)

    completo = not faltando and not divergentes
    return {
        "diretorio": str(dest),
        "modelo_id": man.get("modelo_id"),
        "modelo_version": man.get("modelo_version"),
        "publicado": bool(man.get("publicado")),
        "completo": completo,
        "presentes": presentes,
        "faltando": faltando,
        "hashes": hashes,
        "divergentes": divergentes,
    }


def verificar_artefatos(
    diretorio: str | Path | None = None,
    *,
    conferir_hash: bool = True,
    manifest: dict | None = None,
) -> dict:
    """Como status_artefatos, mas levanta RuntimeError se incompleto."""
    st = status_artefatos(diretorio, conferir_hash=conferir_hash, manifest=manifest)
    if st["faltando"]:
        raise RuntimeError(
            "Artefatos do classificador ausentes em "
            f"{st['diretorio']}: {', '.join(st['faltando'])}. "
            "Instale via pacote do launcher ou "
            "`python -m automacoes.classificador_documentos.instalar_artefatos`."
        )
    if st["divergentes"]:
        raise RuntimeError(
            "Artefatos do classificador com SHA-256 diferente do manifest em "
            f"{st['diretorio']}: {', '.join(st['divergentes'])}."
        )
    return st


def instalar_artefatos(
    fonte: str | Path,
    destino: str | Path | None = None,
    *,
    conferir_hash: bool = True,
    dry_run: bool = False,
) -> dict:
    """Copia os 3 arquivos (+ manifest, se existir na fonte) para o destino canônico.

    `fonte` é uma pasta que já contém modelo.pt, vetorizador.joblib e
    indice_para_rotulo.joblib (ex.: zip de release descompactado, ou saída do treino).
    """
    src = Path(fonte).expanduser().resolve()
    if not src.is_dir():
        raise FileNotFoundError(f"Pasta fonte de artefatos não existe: {src}")

    man_fonte = src / "manifest.json"
    manifest = carregar_manifest(man_fonte) if man_fonte.is_file() else carregar_manifest()

    faltando_fonte = [n for n in ARQUIVOS_OBRIGATORIOS if not (src / n).is_file()]
    if faltando_fonte:
        raise FileNotFoundError(
            f"Fonte incompleta em {src}: faltam {', '.join(faltando_fonte)}"
        )

    dest = destino_artefatos(destino, criar=not dry_run)
    copiados = []

    for nome in ARQUIVOS_OBRIGATORIOS:
        origem = src / nome
        alvo = dest / nome
        if not dry_run:
            shutil.copy2(origem, alvo)
        copiados.append(nome)

    if man_fonte.is_file() and not dry_run:
        shutil.copy2(man_fonte, dest / "manifest.json")

    st = status_artefatos(dest, conferir_hash=conferir_hash, manifest=manifest)
    if not dry_run and conferir_hash and manifest.get("publicado"):
        verificar_artefatos(dest, conferir_hash=True, manifest=manifest)

    return {
        "fonte": str(src),
        "destino": str(dest),
        "copiados": copiados,
        "dry_run": dry_run,
        "status": st,
    }


def caminhos_arquivo(
    diretorio: str | Path | None = None,
) -> dict[str, Path]:
    """Mapa nome → Path absoluto (não exige existência)."""
    dest = destino_artefatos(diretorio)
    return {nome: dest / nome for nome in ARQUIVOS_OBRIGATORIOS}
