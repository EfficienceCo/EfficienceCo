import os
from comunicacao.reportar_evento import reportar_evento
from core.estrutura_pastas import SUBPASTAS, criar_estrutura_empresa_em
from core.utils import validar_caminho, validar_nome


def _extrair_nome_empresa(condicao):
    if isinstance(condicao, dict):
        nome = condicao.get("nome_empresa")
        if nome:
            return str(nome).strip()
        return None

    if isinstance(condicao, str) and condicao.startswith("nome_empresa="):
        return condicao.split("=", 1)[1].strip()

    return None


def criar_estrutura_empresa(regra):
    pasta_base = regra.get("pasta_destino") or os.getenv("PASTA_BASE")
    if not pasta_base:
        raise RuntimeError(
            "pasta_base não definida — configure pasta_destino na regra ou PASTA_BASE no .env"
        )

    nome_empresa = _extrair_nome_empresa(regra.get("condicao", ""))
    if not nome_empresa:
        raise RuntimeError(
            "Condição inválida para abertura_empresa — esperado: nome_empresa=<nome> "
            "ou condicao.nome_empresa"
        )

    validar_nome(nome_empresa)
    validar_caminho(pasta_base)
    pasta_empresa = os.path.join(pasta_base, nome_empresa)

    try:
        criadas = criar_estrutura_empresa_em(pasta_empresa)

        if criadas:
            print(f"[abertura_empresa] Subpastas criadas: {', '.join(criadas)}")
        else:
            print(f"[abertura_empresa] Estrutura já existia para: {nome_empresa}")

        reportar_evento(f"Estrutura de pastas criada para {nome_empresa}", True)
        return pasta_empresa

    except PermissionError:
        raise RuntimeError(f"Sem permissão para criar estrutura de {nome_empresa}")
    except Exception as e:
        raise RuntimeError(f"Erro ao criar estrutura de {nome_empresa}: {e}")


# Re-export para compatibilidade com imports existentes
__all__ = ["SUBPASTAS", "criar_estrutura_empresa"]
