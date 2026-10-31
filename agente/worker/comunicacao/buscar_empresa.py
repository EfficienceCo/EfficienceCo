"""Consulta empresa pelo CNPJ via API do backend."""

import comunicacao.api_client as client


class EmpresaLookupIndisponivel(RuntimeError):
    """Cadastro não pôde ser consultado; não significa empresa inexistente."""


def buscar_empresa_por_cnpj(cnpj, *, falhar_se_indisponivel=False):
    """
    GET /clientes/por-cnpj. Retorna {"id", "nome"} ou None
    (não encontrado, CNPJ inválido, sem id, rede/auth no modo tolerante).
    O modo estrito distingue indisponibilidade de ausência de cadastro.
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
        if not isinstance(body, dict):
            if falhar_se_indisponivel:
                raise EmpresaLookupIndisponivel("resposta de cadastro inválida")
            return None
        cliente_id = body.get("id")
        nome = body.get("nome")
        if (
            isinstance(cliente_id, str)
            and cliente_id.strip()
            and isinstance(nome, str)
            and nome.strip()
        ):
            return {"id": cliente_id.strip(), "nome": nome.strip()}
        if falhar_se_indisponivel:
            raise EmpresaLookupIndisponivel("resposta de cadastro incompleta")
        return None
    except client.ApiError as e:
        if e.status_code in (400, 404):
            return None
        if falhar_se_indisponivel:
            raise EmpresaLookupIndisponivel("falha na consulta de cadastro") from e
        print(f"[buscar_empresa_por_cnpj] Erro API: {e}")
        return None
    except Exception as e:
        if falhar_se_indisponivel:
            raise EmpresaLookupIndisponivel("falha na consulta de cadastro") from e
        print(f"[buscar_empresa_por_cnpj] Falha: {e}")
        return None


def buscar_empresa_por_cnpj_estrito(cnpj):
    """NF-e precisa manter o XML no inbox quando o cadastro está indisponível."""
    return buscar_empresa_por_cnpj(cnpj, falhar_se_indisponivel=True)
