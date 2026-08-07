"""Resolve a empresa de um arquivo pelo nome, CNPJ (API) ou razão social no conteúdo."""

import os
import re
import unicodedata

from comunicacao.buscar_empresa import buscar_empresa_por_cnpj
from core.extrair_texto import extrair_texto

CNPJ_REGEX = re.compile(
    r"\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2}"
)


def normalizar_nome(texto):
    if not texto:
        return ""
    texto = os.path.splitext(os.path.basename(str(texto)))[0]
    texto = unicodedata.normalize("NFKD", texto)
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    texto = texto.lower()
    texto = re.sub(r"[^a-z0-9]+", "", texto)
    return texto


def normalizar_texto_livre(texto):
    """Normaliza bloco de texto (sem tratar como path/basename)."""
    if not texto:
        return ""
    texto = unicodedata.normalize("NFKD", str(texto))
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    texto = texto.lower()
    texto = re.sub(r"[^a-z0-9]+", "", texto)
    return texto


def listar_empresas(pasta_base):
    """Retorna lista de (nome_exibido, nome_normalizado) das pastas filhas."""
    if not pasta_base or not os.path.isdir(pasta_base):
        return []

    empresas = []
    try:
        for entrada in os.listdir(pasta_base):
            caminho = os.path.join(pasta_base, entrada)
            if os.path.isdir(caminho):
                empresas.append((entrada, normalizar_nome(entrada)))
    except OSError as e:
        print(f"[identificar_empresa] Falha ao listar {pasta_base}: {e}")
        return []

    return empresas


def extrair_cnpjs(texto):
    """Lista CNPJs únicos (14 dígitos) encontrados no texto, na ordem."""
    if not texto:
        return []
    vistos = set()
    resultado = []
    for m in CNPJ_REGEX.finditer(texto):
        digitos = re.sub(r"\D", "", m.group(0))
        if len(digitos) == 14 and digitos not in vistos:
            vistos.add(digitos)
            resultado.append(digitos)
    return resultado


def _match_empresa_propria(texto_norm, empresas, empresa_propria):
    if not empresa_propria:
        return None
    propria_norm = normalizar_nome(empresa_propria)
    if not propria_norm or propria_norm not in texto_norm:
        return None
    for nome_exibido, nome_emp_norm in empresas:
        if (
            nome_emp_norm == propria_norm
            or propria_norm in nome_emp_norm
            or nome_emp_norm in propria_norm
        ):
            return nome_exibido
    return empresa_propria.strip()


def _match_substring_pastas(texto_norm, empresas):
    if not texto_norm:
        return None
    melhores = []
    for nome_exibido, nome_emp_norm in empresas:
        if not nome_emp_norm or len(nome_emp_norm) < 3:
            continue
        if nome_emp_norm in texto_norm:
            melhores.append((len(nome_emp_norm), nome_exibido))
    if not melhores:
        return None
    melhores.sort(key=lambda item: (item[0], len(item[1])), reverse=True)
    return melhores[0][1]


def _identificar_por_nome(nome_arquivo, pasta_base, empresa_propria=None):
    nome_norm = normalizar_nome(nome_arquivo)
    if not nome_norm:
        return None

    empresas = listar_empresas(pasta_base)
    if not empresas and not empresa_propria:
        return None

    hit_propria = _match_empresa_propria(nome_norm, empresas, empresa_propria)
    if hit_propria:
        return hit_propria

    if not empresas:
        return None

    return _match_substring_pastas(nome_norm, empresas)


def _identificar_por_conteudo(caminho_arquivo, pasta_base, empresa_propria=None):
    if not caminho_arquivo or not os.path.isfile(caminho_arquivo):
        return None

    texto = extrair_texto(caminho_arquivo)
    if not texto:
        return None

    for cnpj in extrair_cnpjs(texto):
        nome = buscar_empresa_por_cnpj(cnpj)
        if nome:
            return nome

    empresas = listar_empresas(pasta_base)
    texto_norm = normalizar_texto_livre(texto)

    hit_propria = _match_empresa_propria(texto_norm, empresas, empresa_propria)
    if hit_propria:
        return hit_propria

    return _match_substring_pastas(texto_norm, empresas)


def identificar_empresa(caminho_ou_nome, pasta_base, empresa_propria=None):
    """
    Encontra a pasta de empresa:
    1) match pelo nome do arquivo × pastas em pasta_base
    2) fallback: texto/OCR → CNPJ via API → razão social × pastas

    Se empresa_propria estiver definida e casar no nome/texto, retorna o nome
    da pasta correspondente (ou o próprio valor para o organizador criar).
    """
    nome_arquivo = os.path.basename(str(caminho_ou_nome)) if caminho_ou_nome else ""
    hit = _identificar_por_nome(nome_arquivo, pasta_base, empresa_propria=empresa_propria)
    if hit:
        return hit

    caminho = caminho_ou_nome if caminho_ou_nome and os.path.isfile(str(caminho_ou_nome)) else None
    if not caminho:
        # só basename — sem arquivo no disco para OCR
        return None

    return _identificar_por_conteudo(caminho, pasta_base, empresa_propria=empresa_propria)
