import comunicacao.api_client as client

def validar_licenca():
   try:
        response = client.get("/licenca/validar", addToHeaders={"x-licenca-token": client.LICENSE_TOKEN})
        dados = response.json()
        if dados.get("ativa"):
            return "ativa"
        else:
            return "inativa"
   except RuntimeError:
        raise