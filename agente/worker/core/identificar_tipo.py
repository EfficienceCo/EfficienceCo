import json
import os
import re
from pathlib import Path

TIPOS_PATH = Path(__file__).parent / "tipos_documentos.json"

# Pacotes importados pelo classificador de produção (nível de módulo ou lazy).
# ModuleNotFoundError com esses nomes = deps ausentes, não módulo apagado.
_DEPS_REDE = frozenset({
    "torch",
    "torchvision",
    "pypdfium2",
    "PIL",
    "Pillow",
    "pandas",
    "matplotlib",
    "openpyxl",
})


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
        (t for t in tipos if (
            re.search(r"(?<![^\W_])nf(?![^\W_])", os.path.splitext(nome_arquivo)[0], re.IGNORECASE)
            if t == "nf" else t.replace("_", "") in nome_normalizado
        )),
        None
    )


def _eh_modulo_classificador_ausente(nome_modulo):
    """True quando o .py do classificador (ou o pacote rede) sumiu do tree."""
    if not nome_modulo:
        return False
    return (
        nome_modulo == "automacoes.rede"
        or nome_modulo == "automacoes.rede.classificador"
        or nome_modulo.startswith("automacoes.rede.")
    )


def _eh_erro_de_pesos(mensagem):
    texto = (mensagem or "").lower()
    return (
        ".pth" in texto
        or "arquivo de modelo" in texto
        or ("modelo" in texto and "não existe" in texto)
        or ("pesos" in texto and ("ausente" in texto or "não encontr" in texto))
    )


def classificar_arquivo(caminho):
    try:
        from automacoes.rede.classificador import classificar_documento
        resultado = classificar_documento(caminho, threshold=0.75)
        if isinstance(resultado, dict) and resultado.get("erro"):
            erro = resultado["erro"]
            # classificar_documento devolve dict (não levanta) quando o .pth falta —
            # distinguir de erro de extensão/PDF pra quem for debugar (BUG-ML-06 / #514).
            if _eh_erro_de_pesos(erro):
                print(f"[identificar_tipo] Pesos do classificador ausentes: {erro}")
            else:
                print(f"[identificar_tipo] Classificador: {erro}")
            return "nao_identificado"
        return resultado["classe"]
    except ModuleNotFoundError as e:
        # ModuleNotFoundError ⊂ ImportError — tratar antes do ramo genérico.
        nome = e.name or ""
        raiz = nome.split(".", 1)[0] if nome else ""
        if _eh_modulo_classificador_ausente(nome):
            print(
                f"[identificar_tipo] Módulo do classificador ausente ({nome}): {e}. "
                "Restaure automacoes/rede/classificador.py (não é falta de torch)."
            )
        elif nome in _DEPS_REDE or raiz in _DEPS_REDE:
            print(
                f"[identificar_tipo] Dependência da rede neural ausente ({nome}): {e}. "
                "Instale via requirements.txt do worker."
            )
        else:
            print(
                f"[identificar_tipo] Módulo ou dependência ausente ao carregar o classificador "
                f"({nome or 'desconhecido'}): {e}"
            )
        return "nao_identificado"
    except ImportError as e:
        print(
            f"[identificar_tipo] Falha ao importar o classificador (deps ou pacote quebrado): {e}"
        )
        return "nao_identificado"
    except FileNotFoundError as e:
        print(f"[identificar_tipo] Pesos do classificador ausentes: {e}")
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
