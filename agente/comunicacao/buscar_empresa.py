"""Consulta empresa pelo CNPJ via API do backend."""

import comunicacao.api_client as client


def buscar_empresa_por_cnpj(cnpj):
    """
    GET /clientes/por-cnpj. Retorna o nome da empresa ou None
    (não encontrado, CNPJ inválido, rede/auth).
    """
    if not cnpj:
        return None

    digitos = "".join(c for c in str(cnpj) if c.isdigit())
    if len(digitos) != 14:
        return None

    try:
        response = client.get(
            f"/clientes/por-cnpj?cnpj={digitos}",
            timeout=5,
            addToHeaders={"x-licenca-token": client.LICENSE_TOKEN},
        )
        body = response.json()
        nome = body.get("nome") if isinstance(body, dict) else None
        if isinstance(nome, str) and nome.strip():
            return nome.strip()
        return None
    except client.ApiError as e:
        if e.status_code in (400, 404, 401):
            return None
        print(f"[buscar_empresa_por_cnpj] Erro API: {e}")
        return None
    except Exception as e:
        print(f"[buscar_empresa_por_cnpj] Falha: {e}")
        return None
