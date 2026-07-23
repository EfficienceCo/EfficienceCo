import os
import re
import shutil
from datetime import datetime
import comunicacao.api_client as client
from core.utils import validar_caminho

# Folha/YYYY-MM/... — mês canônico alinhado ao backend
REGEX_FOLHA_MES = re.compile(
    r"[\\/]Folha[\\/](\d{4}-(0[1-9]|1[0-2]))(?:[\\/]|$)",
    re.IGNORECASE,
)

PASTA_ENVIADOS = "enviados"


def extrair_mes_folha(caminho):
    """Retorna YYYY-MM se o path estiver sob Folha/YYYY-MM; senão None."""
    match = REGEX_FOLHA_MES.search(os.path.abspath(caminho))
    if not match:
        return None
    return match.group(1)


def _esta_em_enviados(caminho):
    partes = os.path.abspath(caminho).replace("/", os.sep).split(os.sep)
    return any(p.lower() == PASTA_ENVIADOS for p in partes)


def eh_planilha_folha(caminho):
    if _esta_em_enviados(caminho):
        return False
    if not caminho.lower().endswith(".xlsx"):
        return False
    return extrair_mes_folha(caminho) is not None


def _arquivar_apos_envio(caminho, pasta_destino=None):
    """Move o arquivo para fora da pasta monitorada (evita reenvio no restart)."""
    nome = os.path.basename(caminho)

    if pasta_destino:
        destino_dir = pasta_destino
    else:
        destino_dir = os.path.join(os.path.dirname(caminho), PASTA_ENVIADOS)

    try:
        validar_caminho(caminho)
        validar_caminho(destino_dir)

        os.makedirs(destino_dir, exist_ok=True)
        destino = os.path.join(destino_dir, nome)

        if os.path.exists(destino):
            nome_sem_ext, ext = os.path.splitext(nome)
            timestamp = datetime.now().strftime("%Y-%m-%dT%H-%M-%S")
            destino = os.path.join(destino_dir, f"{nome_sem_ext}_{timestamp}{ext}")

        shutil.move(caminho, destino)
        return destino
    except RuntimeError:
        raise
    except PermissionError:
        raise RuntimeError(f"Sem permissão para arquivar {nome}")
    except Exception as e:
        raise RuntimeError(f"Erro ao arquivar {nome}: {e}")


def enviar_planilha_folha(caminho, pasta_destino=None):
    """
    Envia .xlsx de Folha/YYYY-MM para POST /folha/upload/agente
    e arquiva o arquivo local após sucesso.
    Retorna (mes, caminho_arquivado).
    """
    if _esta_em_enviados(caminho):
        raise RuntimeError("Arquivo já está na pasta de enviados")

    mes = extrair_mes_folha(caminho)
    if not mes:
        raise RuntimeError("Caminho não está em Folha/YYYY-MM")

    if not caminho.lower().endswith(".xlsx"):
        raise RuntimeError("Apenas arquivos .xlsx são aceitos para upload de folha")

    client.postFile(
        "/folha/upload/agente",
        caminho,
        campos={"mes_referencia": mes},
        timeout=60,
        addToHeaders={"x-licenca-token": client.LICENSE_TOKEN},
    )

    arquivado = _arquivar_apos_envio(caminho, pasta_destino)
    return mes, arquivado
