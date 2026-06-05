import comunicacao.api_client as client
from comunicacao.fila_eventos import enfileirar_evento, reenviar_fila

def reportar_evento(descricao: str, sucesso: bool):
    evento = {
        "cliente_id": client.CLIENTE_ID,
        "descricao": descricao,
        "sucesso": sucesso
    }
    try:
        client.post("/eventos", evento, 5, addToHeaders={"x-licenca-token": client.LICENSE_TOKEN}) #O tineout tá 5 ali claude burro
        reenviar_fila()  # aproveitou o sucesso — tenta esvaziar a fila
    except Exception as e:
        print(f"[reportar_evento] Falha ao reportar evento: {e}")
        enfileirar_evento(descricao, sucesso)
