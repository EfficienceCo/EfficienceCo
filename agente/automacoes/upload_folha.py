import os
import re
import comunicacao.api_client as client

# Folha/YYYY-MM/... — mês canônico alinhado ao backend
REGEX_FOLHA_MES = re.compile(
    r"[\\/]Folha[\\/](\d{4}-(0[1-9]|1[0-2]))(?:[\\/]|$)",
    re.IGNORECASE,
)


def extrair_mes_folha(caminho):
    """Retorna YYYY-MM se o path estiver sob Folha/YYYY-MM; senão None."""
    match = REGEX_FOLHA_MES.search(os.path.abspath(caminho))
    if not match:
        return None
    return match.group(1)


def eh_planilha_folha(caminho):
    if not caminho.lower().endswith(".xlsx"):
        return False
    return extrair_mes_folha(caminho) is not None


def enviar_planilha_folha(caminho):
    """Envia .xlsx de Folha/YYYY-MM para POST /folha/upload. Retorna o mês usado."""
    mes = extrair_mes_folha(caminho)
    if not mes:
        raise RuntimeError("Caminho não está em Folha/YYYY-MM")

    if not caminho.lower().endswith(".xlsx"):
        raise RuntimeError("Apenas arquivos .xlsx são aceitos para upload de folha")

    client.postFile(
        "/folha/upload",
        caminho,
        campos={"mes_referencia": mes},
        timeout=60,
        addToHeaders={"x-licenca-token": client.LICENSE_TOKEN},
    )
    return mes
