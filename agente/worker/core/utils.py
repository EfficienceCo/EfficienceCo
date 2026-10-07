import os


def resolver_pasta_base(pasta_base=None):
    """Resolve a raiz local do agente sem permitir override remoto.

    PASTA_BASE é configurada na máquina onde o agente grava os arquivos e,
    quando presente, sempre prevalece sobre o valor recebido da API. O valor
    explícito fica apenas como compatibilidade para instalações antigas que
    ainda não injetam a variável local.
    """
    pasta_base_local = os.getenv("PASTA_BASE", "").strip()
    if pasta_base_local:
        return pasta_base_local

    if isinstance(pasta_base, str):
        return pasta_base.strip()

    return ""


def validar_caminho(caminho):
    pasta_base = os.getenv("PASTA_BASE", "")
    if not pasta_base:
        return

    # normcase: no Windows C:\Souza e c:\souza são o mesmo path (#638 / QA-A A1).
    # commonpath: evita falso positivo de startswith (ex.: C:\Souza vs C:\SouzaExtra).
    caminho_abs = os.path.normcase(os.path.abspath(caminho))
    base_abs = os.path.normcase(os.path.abspath(pasta_base))

    try:
        dentro = os.path.commonpath([caminho_abs, base_abs]) == base_abs
    except ValueError:
        dentro = False

    if not dentro:
        raise ValueError(f"Caminho fora da PASTA_BASE: {caminho}")

def validar_nome(nome):
    import re

    texto = nome.strip() if isinstance(nome, str) else ""
    if texto in {"", ".", ".."} or not re.fullmatch(r'[\w\s\-\.,&]+', texto):
        raise ValueError(f"Nome inválido: {nome}")
