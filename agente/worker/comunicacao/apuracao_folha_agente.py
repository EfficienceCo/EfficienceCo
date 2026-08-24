"""Cliente do canal de folha / Fator R (AP-3) — poll, upload e report."""

import os

import comunicacao.api_client as client
from automacoes.upload_folha import extrair_mes_folha

TIMEOUT_FOLHA = 15
TIMEOUT_UPLOAD = 60


def _headers_licenca():
    return {"x-licenca-token": client.LICENSE_TOKEN}


def buscar_folha_pendente():
    """
    GET /apuracoes/folha-pendente
    Retorna lista de dicts (pode ser vazia). Levanta ApiError/RuntimeError em falha HTTP.
    """
    response = client.get(
        "/apuracoes/folha-pendente",
        timeout=TIMEOUT_FOLHA,
        addToHeaders=_headers_licenca(),
    )
    body = response.json() if response.content else []
    if not isinstance(body, list):
        return []
    return body


def reportar_resultado_folha(apuracao_id, payload):
    """
    POST /apuracoes/{id}/resultado-folha
    payload: { temDozeMeses, mesesEncontrados, totalMesesEncontrados }
    Retorna o JSON da resposta. Levanta ApiError/RuntimeError em falha HTTP.
    """
    response = client.post(
        f"/apuracoes/{apuracao_id}/resultado-folha",
        payload,
        timeout=TIMEOUT_FOLHA,
        addToHeaders=_headers_licenca(),
    )
    if response.content:
        try:
            return response.json()
        except Exception:
            return {}
    return {}


def enviar_planilha_apuracao(caminho):
    """
    POST /folha/upload/agente — uma planilha, sem arquivar localmente.
    Diferente de upload_folha.enviar_planilha_folha (watcher holerite).
    Retorna mes_referencia (YYYY-MM) em sucesso.
    """
    mes = extrair_mes_folha(caminho)
    if not mes:
        raise RuntimeError("Caminho não está em Folha/YYYY-MM")

    if not str(caminho).lower().endswith(".xlsx"):
        raise RuntimeError("Apenas arquivos .xlsx são aceitos para upload de folha")

    client.postFile(
        "/folha/upload/agente",
        caminho,
        campos={"mes_referencia": mes},
        timeout=TIMEOUT_UPLOAD,
        addToHeaders=_headers_licenca(),
    )
    return mes


def enviar_arquivos_folha(caminhos):
    """
    Envia cada planilha encontrada. Falha de um arquivo: loga e continua.
    Não apaga nem move o arquivo local.
    Retorna lista de caminhos enviados com sucesso.
    """
    enviados = []
    for caminho in caminhos:
        nome = os.path.basename(caminho)
        try:
            enviar_planilha_apuracao(caminho)
            enviados.append(caminho)
            print(f"[apuracao_folha] Upload ok: {nome}")
        except Exception as e:
            print(f"[apuracao_folha] Falha no upload de {nome}: {e}")
    return enviados
