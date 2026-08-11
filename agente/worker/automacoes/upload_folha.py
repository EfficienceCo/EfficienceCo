import os
import re
import shutil
from datetime import datetime
import comunicacao.api_client as client
from comunicacao.api_client import ApiError
from core.utils import validar_caminho
from automacoes.aviso_windows import aviso_erro

# Folha/YYYY-MM — mês canônico alinhado ao backend.
# Âncora no fim (`$`) exige que o arquivo esteja DIRETAMENTE na pasta do mês, não em
# subpastas. Sem isso, qualquer subpasta sob Folha/YYYY-MM (ex.: um pasta_destino de
# arquivamento customizado que não se chame "enviados") seria detectada de novo pelo
# watcher recursivo e reenviada em loop — mesmo arquivo processado repetidamente.
REGEX_FOLHA_MES = re.compile(
    r"[\\/]Folha[\\/](\d{4}-(0[1-9]|1[0-2]))$",
    re.IGNORECASE,
)

PASTA_ENVIADOS = "enviados"
PASTA_REJEITADOS = "rejeitados"
_PASTAS_ARQUIVAMENTO = {PASTA_ENVIADOS.lower(), PASTA_REJEITADOS.lower()}


class PlanilhaRejeitadaError(RuntimeError):
    """Planilha recusada pelo servidor (validação); já arquivada em rejeitados."""

    def __init__(self, mensagem, caminho_arquivado=None):
        super().__init__(mensagem)
        self.caminho_arquivado = caminho_arquivado


def extrair_mes_folha(caminho):
    """Retorna YYYY-MM se o arquivo estiver diretamente em Folha/YYYY-MM; senão None."""
    pasta = os.path.dirname(os.path.abspath(caminho))
    match = REGEX_FOLHA_MES.search(pasta)
    if not match:
        return None
    return match.group(1)


def _esta_em_pasta_arquivamento(caminho):
    partes = os.path.abspath(caminho).replace("/", os.sep).split(os.sep)
    return any(p.lower() in _PASTAS_ARQUIVAMENTO for p in partes)


def eh_planilha_folha(caminho):
    if _esta_em_pasta_arquivamento(caminho):
        return False
    if not caminho.lower().endswith(".xlsx"):
        return False
    return extrair_mes_folha(caminho) is not None


def _arquivar(caminho, destino_dir):
    """Move o arquivo para destino_dir (cria a pasta se preciso; deduplica nome)."""
    nome = os.path.basename(caminho)

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


def _destino_sucesso(caminho, pasta_destino=None):
    if pasta_destino:
        return pasta_destino
    return os.path.join(os.path.dirname(caminho), PASTA_ENVIADOS)


def _destino_rejeicao(caminho):
    return os.path.join(os.path.dirname(caminho), PASTA_REJEITADOS)


def _motivos_rejeicao(erro):
    """Lista de motivos legíveis a partir de ApiError (faltando ou mensagem)."""
    body = getattr(erro, "body", None) or {}
    faltando = body.get("faltando")
    if faltando:
        return [f"coluna '{c}' ausente no cabeçalho" for c in faltando]
    texto = str(erro)
    # Remove prefixo "Erro NNN em METHOD /path: " se presente
    if ": " in texto:
        texto = texto.split(": ", 1)[-1]
    return [texto] if texto else ["motivo não informado pelo servidor"]


def _mensagem_rejeicao(nome_arquivo, motivos):
    linhas = "\n".join(f"- {m}" for m in motivos)
    return (
        f'A planilha "{nome_arquivo}" não foi aceita pelo servidor.\n\n'
        f"Motivos:\n{linhas}"
    )


def _tratar_rejeicao(caminho, erro):
    """Arquiva em rejeitados, mostra MessageBox e levanta PlanilhaRejeitadaError."""
    nome = os.path.basename(caminho)
    motivos = _motivos_rejeicao(erro)
    mensagem_ui = _mensagem_rejeicao(nome, motivos)

    arquivado = None
    try:
        arquivado = _arquivar(caminho, _destino_rejeicao(caminho))
    except RuntimeError as e:
        print(
            f"[upload_folha] Rejeição de {nome}, "
            f"mas falha ao arquivar em rejeitados: {e}"
        )

    aviso_erro("Efficience — Planilha não aceita", mensagem_ui)

    raise PlanilhaRejeitadaError(
        f"Planilha {nome} rejeitada: {'; '.join(motivos)}",
        caminho_arquivado=arquivado,
    )


def enviar_planilha_folha(caminho, pasta_destino=None):
    """
    Envia .xlsx de Folha/YYYY-MM para POST /folha/upload/agente
    e arquiva o arquivo local após sucesso (enviados/pasta_destino)
    ou rejeição 400 (rejeitados + aviso Windows).
    Retorna (mes, caminho_arquivado) em sucesso.
    """
    if _esta_em_pasta_arquivamento(caminho):
        raise RuntimeError("Arquivo já está em pasta de arquivamento (enviados/rejeitados)")

    mes = extrair_mes_folha(caminho)
    if not mes:
        raise RuntimeError("Caminho não está em Folha/YYYY-MM")

    if not caminho.lower().endswith(".xlsx"):
        raise RuntimeError("Apenas arquivos .xlsx são aceitos para upload de folha")

    try:
        client.postFile(
            "/folha/upload/agente",
            caminho,
            campos={"mes_referencia": mes},
            timeout=60,
            addToHeaders={"x-licenca-token": client.LICENSE_TOKEN},
        )
    except ApiError as e:
        # 400 com validação de colunas (ou outro 400 de aceitação) → sinal local
        if e.status_code == 400:
            _tratar_rejeicao(caminho, e)
        raise

    # Upload já concluído com sucesso a partir daqui — se o arquivamento local falhar
    # (permissão, disco cheio etc.), isso não pode ser reportado como falha de
    # processamento (o backend já recebeu e persistiu a planilha). Do contrário o
    # monitor reporta "falha" para um envio que na verdade deu certo, e o arquivo
    # continua em Folha/YYYY-MM sujeito a reenvio duplicado numa próxima varredura.
    try:
        arquivado = _arquivar(caminho, _destino_sucesso(caminho, pasta_destino))
    except RuntimeError as e:
        print(
            f"[upload_folha] Upload de {os.path.basename(caminho)} concluído, "
            f"mas falha ao arquivar localmente: {e}"
        )
        arquivado = caminho

    return mes, arquivado
