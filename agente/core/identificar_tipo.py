import json
import os
from pathlib import Path

TIPOS_PATH = Path(__file__).parent / "tipos_documentos.json"

def _carregar_tipos():
    try:
        with open(TIPOS_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"[identificar_tipo] Erro ao carregar tipos: {e}")
        return []

def identificar_tipo_no_nome(nome_arquivo):
    tipos = _carregar_tipos()
    nome_normalizado = os.path.splitext(nome_arquivo)[0].lower().replace("_", "").replace(" ", "")
    
    return next(
        (t for t in tipos if t.replace("_", "") in nome_normalizado),
        None
    )

def classificar_arquivo(caminho):
    try:
        from automacoes.rede_neural.rede import classificar_documento_pdf
        resultado = classificar_documento_pdf(caminho, threshold=0.75)
        return resultado["classe"]
    except ImportError as e:
        print(f"[identificar_tipo] Dependências da rede neural não instaladas: {e}")
        return "nao_identificado"
    except FileNotFoundError:
        print(f"[identificar_tipo] Arquivo de pesos não encontrado (classificador_documentos.pth)")
        return "nao_identificado"
    except Exception as e:
        print(f"[identificar_tipo] Falha ao classificar: {e}")
        return "nao_identificado"

def obter_tipo(caminho):
    nome = os.path.basename(caminho)
    
    tipo_no_nome = identificar_tipo_no_nome(nome)
    if tipo_no_nome:
        print(f"[identificar_tipo] Tipo encontrado no nome: {tipo_no_nome}")
        return tipo_no_nome, False  # False = não precisa renomear
    
    print(f"[identificar_tipo] Tipo não encontrado no nome — classificando...")
    tipo = classificar_arquivo(caminho)
    print(f"[identificar_tipo] Tipo classificado: {tipo}")
    return tipo, True  # True = precisa renomear
