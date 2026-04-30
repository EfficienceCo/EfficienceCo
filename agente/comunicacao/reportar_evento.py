import comunicacao.api_client as client

def reportar_evento(descricao: str, sucesso: bool):
    evento = {
        "cliente_id": client.CLIENTE_ID,
        "descricao": descricao,
        "sucesso": sucesso
    }
    try:
       client.post("/eventos", evento, 5, {"x-licenca-token": client.LICENSE_TOKEN})
    except Exception as e:
        print(f"[reportar_evento] Falha ao reportar evento: {e}")
