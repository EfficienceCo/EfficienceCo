"""Cliente do canal de etapas automatizadas (#266)."""

import comunicacao.api_client as client

TIMEOUT_ETAPAS = 15


def _headers_licenca():
    return {"x-licenca-token": client.LICENSE_TOKEN}


def listar_etapas_prontas():
    """
    GET /processos/etapas/agente — reivindica etapas e devolve a lista achatada.
    Retorna lista de dicts (pode ser vazia). Levanta ApiError/RuntimeError em falha HTTP.
    """
    response = client.get(
        "/processos/etapas/agente",
        timeout=TIMEOUT_ETAPAS,
        addToHeaders=_headers_licenca(),
    )
    body = response.json() if response.content else {}
    data = body.get("data") if isinstance(body, dict) else None
    if not isinstance(data, list):
        return []
    return data


def concluir_execucao(
    etapa_id,
    *,
    sucesso,
    execucao_token,
    arquivo_gerado=None,
    erro=None,
):
    """
    POST /processos/etapas/:etapaId/concluir-execucao
    Retorna o JSON da resposta. Levanta ApiError/RuntimeError em falha HTTP.
    """
    payload = {
        "sucesso": bool(sucesso),
        "execucao_token": execucao_token,
    }
    if sucesso and arquivo_gerado is not None:
        payload["arquivo_gerado"] = arquivo_gerado
    if not sucesso and erro is not None:
        payload["erro"] = erro

    response = client.post(
        f"/processos/etapas/{etapa_id}/concluir-execucao",
        payload,
        timeout=TIMEOUT_ETAPAS,
        addToHeaders=_headers_licenca(),
    )
    if response.content:
        try:
            return response.json()
        except Exception:
            return {}
    return {}
