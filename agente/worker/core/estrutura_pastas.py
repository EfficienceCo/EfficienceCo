"""Contrato de pastas compartilhado entre abertura_empresa e organizar_arquivo."""

from datetime import datetime
import os

SUBPASTAS = [
    "Documentos",
    "Contratos",
    "Requerimentos",
    "Comprovantes",
    "Correspondencias",
    "Folha",
    "Notas Fiscais",
    "Declaracoes",
]

TIPO_PARA_SUBPASTA = {
    "cartao_cnpj": "Documentos",
    "contrato_social": "Contratos",
    "extrato_bancario": "Comprovantes",
    "holerite": "Folha",
    "folha_pagamento": "Folha",
    "nota_fiscal": "Notas Fiscais",
    "nf": "Notas Fiscais",
    "declaracao": "Declaracoes",
    "recibo": "Declaracoes",
}

SUBPASTAS_COM_MES = frozenset({"Folha", "Declaracoes", "Notas Fiscais"})

PASTA_NAO_CLASSIFICADO = "NAO_CLASSIFICADO"


def criar_estrutura_empresa_em(pasta_empresa):
    """Cria as subpastas canônicas sob pasta_empresa. Retorna as que foram criadas."""
    criadas = []
    for subpasta in SUBPASTAS:
        caminho = os.path.join(pasta_empresa, subpasta)
        if not os.path.exists(caminho):
            os.makedirs(caminho)
            criadas.append(subpasta)
    return criadas


def subpasta_para_tipo(tipo):
    if not tipo or tipo == "nao_identificado":
        return None
    return TIPO_PARA_SUBPASTA.get(tipo.lower())


def resolver_destino(tipo, nome_empresa, pasta_base, mes=None):
    """
    Resolve o caminho final para um arquivo organizado.
    Retorna None se o tipo não mapeia para subpasta (ex.: nao_identificado).
    """
    subpasta = subpasta_para_tipo(tipo)
    if not subpasta or not nome_empresa:
        return None

    destino = os.path.join(pasta_base, nome_empresa, subpasta)
    if subpasta in SUBPASTAS_COM_MES:
        destino = os.path.join(destino, mes or datetime.now().strftime("%Y-%m"))
    return destino
