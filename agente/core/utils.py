import os

def validar_caminho(caminho):
    pasta_base = os.getenv("PASTA_BASE", "")
    if not pasta_base:
        return
    
    caminho_abs = os.path.abspath(caminho)
    base_abs = os.path.abspath(pasta_base)
    
    if not caminho_abs.startswith(base_abs):
        raise ValueError(f"Caminho fora da PASTA_BASE: {caminho}")

def validar_nome(nome):
    import re
    if not re.match(r'^[\w\s\-\.\,\&]+$', nome):
        raise ValueError(f"Nome inválido: {nome}")
    