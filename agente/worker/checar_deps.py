"""Confere se os imports de deps-runtime.txt existem, sem carregar os modulos.

find_spec nao executa torch, torchvision nem matplotlib. O worker em dev
roda isto antes de subir; se faltar algum nome, run-worker-dev.cmd instala
requirements.txt.
"""

import importlib.util
import sys
from pathlib import Path

MANIFESTO = Path(__file__).with_name("deps-runtime.txt")


def modulos(texto=None):
    if texto is None:
        texto = MANIFESTO.read_text(encoding="utf-8")
    nomes = []
    for linha in texto.splitlines():
        nome = linha.split("#", 1)[0].strip()
        if nome:
            nomes.append(nome)
    return nomes


def faltando(nomes=None):
    ausentes = []
    for nome in nomes if nomes is not None else modulos():
        try:
            spec = importlib.util.find_spec(nome)
        except (ImportError, ValueError):
            spec = None
        if spec is None:
            ausentes.append(nome)
    return ausentes


if __name__ == "__main__":
    ausentes = faltando()
    if ausentes:
        sys.exit(1)
