import os
from comunicacao.reportar_evento import reportar_evento
from core.utils import validar_caminho, validar_nome

SUBPASTAS = ["Documentos", "Contratos", "Requerimentos", "Comprovantes", "Correspondencias"]

def criar_estrutura_empresa(regra):
    pasta_base = regra.get("pasta_destino") or os.getenv("PASTA_BASE")
    if not pasta_base:
        raise RuntimeError("pasta_base não definida — configure pasta_destino na regra ou PASTA_BASE no .env")
    condicao = regra.get("condicao", "")
    
    if not condicao.startswith("nome_empresa="):
        raise RuntimeError("Condição inválida para abertura_empresa — esperado: nome_empresa=<nome>")
    
    nome_empresa = condicao.split("=", 1)[1]
    validar_nome(nome_empresa)
    validar_caminho(pasta_base)
    pasta_empresa = os.path.join(pasta_base, nome_empresa)

    try:
        criadas = []
        for subpasta in SUBPASTAS:
            caminho = os.path.join(pasta_empresa, subpasta)
            if not os.path.exists(caminho):
                os.makedirs(caminho)
                criadas.append(subpasta)

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
    