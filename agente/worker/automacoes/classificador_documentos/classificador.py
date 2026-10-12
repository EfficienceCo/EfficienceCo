import os
import re
import sys

import torch
import torch.nn as nn

from automacoes.classificador_documentos import artefatos as art
from automacoes.classificador_documentos.extrator import extrair_texto

# joblib/sklearn NÃO estão no requirements do worker (#513 / #639). Path oficial
# de produção é automacoes.rede.classificador (ResNet). Este módulo (TF-IDF) só
# entra no runtime quando RN-1b ligar a produção — até lá, import tardio.


def _import_joblib():
    try:
        import joblib
    except ModuleNotFoundError as e:
        raise ModuleNotFoundError(
            "joblib/sklearn não fazem parte do runtime do worker "
            "(classificador oficial = automacoes.rede / ResNet). "
            "Só entram ao ligar o TF-IDF em produção (RN-1b). "
            "Ver agente/worker/requirements.txt e a decisão de rede adiada."
        ) from e
    return joblib

# .xls fica fora: o extrator usa openpyxl, que não lê o formato antigo (#649).
EXTENSOES_SUPORTADAS = ('.pdf', '.docx', '.xlsx')

TAMANHO_OCULTO = 32  # tem que bater com o treino (treinar.py)

_artefatos_cache = {}


class ClassificadorDocumentos(nn.Module):
    def __init__(self, tamanho_entrada, tamanho_oculto, numero_classes):
        super().__init__()
        self.camada1 = nn.Linear(tamanho_entrada, tamanho_oculto)
        self.ativacao = nn.ReLU()
        self.camada2 = nn.Linear(tamanho_oculto, numero_classes)

    def forward(self, x):
        x = self.camada1(x)
        x = self.ativacao(x)
        x = self.camada2(x)
        return x


def normalizar_numeros(texto: str) -> str:
    return re.sub(r"\d+", " NUM ", texto)


def _carregar_artefatos(model_path, vetorizador_path, indice_path):
    """Carrega vetorizador/índice/modelo sob demanda, com cache em memória.

    Lazy porque os 3 arquivos vêm de um treino externo (não versionado) — importar
    este módulo não pode falhar só porque o artefato ainda não foi distribuído.
    """
    chave = (model_path, vetorizador_path, indice_path)
    if chave in _artefatos_cache:
        return _artefatos_cache[chave]

    for caminho in (model_path, vetorizador_path, indice_path):
        if not os.path.exists(caminho):
            raise FileNotFoundError(caminho)

    joblib = _import_joblib()
    vetorizador = joblib.load(vetorizador_path)
    rotulo_para_indice = joblib.load(indice_path)
    indice_para_rotulo = {indice: rotulo for rotulo, indice in rotulo_para_indice.items()}

    tamanho_vocabulario = len(vetorizador.get_feature_names_out())
    modelo = ClassificadorDocumentos(
        tamanho_entrada=tamanho_vocabulario,
        tamanho_oculto=TAMANHO_OCULTO,
        numero_classes=len(rotulo_para_indice),
    )
    modelo.load_state_dict(torch.load(model_path, map_location="cpu"))
    modelo.eval()

    artefatos = (vetorizador, indice_para_rotulo, modelo)
    _artefatos_cache[chave] = artefatos
    return artefatos


def classificar_documento(
    arquivo_path,
    model_path=None,
    vetorizador_path=None,
    indice_path=None,
    threshold=0.75,
):
    extensao = os.path.splitext(arquivo_path)[1].lower()
    if extensao not in EXTENSOES_SUPORTADAS:
        return {"erro": f"Extensão '{extensao}' não suportada. Use PDF, DOCX ou XLSX."}

    # Sem caminho explícito, segue o destino canônico dos artefatos
    # (CLASSIFICADOR_ARTEFATOS_DIR > pacote do launcher > pasta do módulo).
    caminhos = art.caminhos_arquivo()
    model_path = model_path or str(caminhos["modelo.pt"])
    vetorizador_path = vetorizador_path or str(caminhos["vetorizador.joblib"])
    indice_path = indice_path or str(caminhos["indice_para_rotulo.joblib"])

    try:
        vetorizador, indice_para_rotulo, modelo = _carregar_artefatos(
            model_path, vetorizador_path, indice_path
        )
    except FileNotFoundError as e:
        return {"erro": f"Artefato do classificador '{e}' não existe. Execute o treinamento primeiro."}
    except ModuleNotFoundError as e:
        return {"erro": str(e)}

    try:
        texto = extrair_texto(arquivo_path)
    except Exception as e:
        return {"erro": f"Erro ao processar o arquivo: {str(e)}"}

    texto_normalizado = normalizar_numeros(texto)
    vetor = vetorizador.transform([texto_normalizado])
    tensor_entrada = torch.tensor(vetor.toarray(), dtype=torch.float32)

    with torch.no_grad():
        saida = modelo(tensor_entrada)
        probabilidades = torch.nn.functional.softmax(saida, dim=1)
        confianca_maxima, pred_idx = torch.max(probabilidades, 1)

    confianca = confianca_maxima.item()
    classe_index = pred_idx.item()

    if confianca >= threshold:
        classe_final = indice_para_rotulo[classe_index]
    else:
        classe_final = "nao_identificado"

    return {
        "classe": classe_final,
        "confianca": round(confianca * 100, 2),
        "limiar_usado": threshold,
    }


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("uso: python -m automacoes.classificador_documentos.classificador <arquivo>")
        raise SystemExit(2)
    resultado = classificar_documento(sys.argv[1])
    if "erro" in resultado:
        print(f"Erro: {resultado['erro']}")
    else:
        print(f"Categoria prevista: {resultado['classe']} ({resultado['confianca']}%)")
