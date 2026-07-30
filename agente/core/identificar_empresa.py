"""Resolve a empresa de um arquivo pelo nome, batendo com pastas sob a base de clientes."""

import os
import re
import unicodedata


def normalizar_nome(texto):
    if not texto:
        return ""
    texto = os.path.splitext(os.path.basename(str(texto)))[0]
    texto = unicodedata.normalize("NFKD", texto)
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


def identificar_empresa(nome_arquivo, pasta_base, empresa_propria=None):
    """
    Encontra a pasta de empresa cujo nome normalizado aparece no nome do arquivo.
    Prefere o match de substring mais longa; em empate, a pasta com nome mais longo.

    Se empresa_propria estiver definida e casar no nome, retorna o nome da pasta
    correspondente sob pasta_base (ou o próprio valor se a pasta existir com esse nome).
    """
    nome_norm = normalizar_nome(nome_arquivo)
    if not nome_norm:
        return None

    empresas = listar_empresas(pasta_base)
    if not empresas:
        return None

    # empresa_propria: tenta casar primeiro se o slug aparecer no arquivo
    if empresa_propria:
        propria_norm = normalizar_nome(empresa_propria)
        if propria_norm and propria_norm in nome_norm:
            for nome_exibido, nome_emp_norm in empresas:
                if nome_emp_norm == propria_norm or propria_norm in nome_emp_norm or nome_emp_norm in propria_norm:
                    return nome_exibido
            # pasta ainda não existe — devolve o nome configurado para o organizador criar
            return empresa_propria.strip()

    melhores = []
    for nome_exibido, nome_emp_norm in empresas:
        if not nome_emp_norm:
            continue
        # evita matches triviais demais (ex.: "a", "sa")
        if len(nome_emp_norm) < 3:
            continue
        if nome_emp_norm in nome_norm:
            melhores.append((len(nome_emp_norm), nome_exibido))

    if not melhores:
        return None

    melhores.sort(key=lambda item: (item[0], len(item[1])), reverse=True)
    return melhores[0][1]
