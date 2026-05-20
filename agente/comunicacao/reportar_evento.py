import comunicacao.api_client as client
from comunicacao.fila_eventos import enfileirar_evento, reenviar_fila

def reportar_evento(descricao: str, sucesso: bool):
    evento = {
        "cliente_id": client.CLIENTE_ID,
        "descricao": descricao,
        "sucesso": sucesso
    }
    try:
        client.post("/eventos", evento, addToHeaders={"x-licenca-token": client.LICENSE_TOKEN})
        reenviar_fila()  # aproveitou o sucesso — tenta esvaziar a fila
    except Exception as e:
        print(f"[reportar_evento] Falha ao reportar evento: {e}")
        enfileirar_evento(descricao, sucesso)
