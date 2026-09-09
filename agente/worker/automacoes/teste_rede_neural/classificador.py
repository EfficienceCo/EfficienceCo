import torch
import torch.nn as nn
import joblib

from extrator import extrair_texto  # suas funções de extração


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
    import re
    return re.sub(r"\d+", " NUM ", texto)


# Carrega tudo que foi salvo no treino
vetorizador = joblib.load("vetorizador.joblib")
rotulo_para_indice = joblib.load("indice_para_rotulo.joblib")
indice_para_rotulo = {indice: rotulo for rotulo, indice in rotulo_para_indice.items()}

tamanho_vocabulario = len(vetorizador.get_feature_names_out())
modelo = ClassificadorDocumentos(
    tamanho_entrada=tamanho_vocabulario,
    tamanho_oculto=32,
    numero_classes=len(rotulo_para_indice),
)
modelo.load_state_dict(torch.load("modelo.pt"))
modelo.eval()


def classificar_arquivo(caminho: str) -> str:
    texto = extrair_texto(caminho)  # seu extrator já devolve o texto
    texto_normalizado = normalizar_numeros(texto)

    vetor = vetorizador.transform([texto_normalizado])  # note a lista [texto] — transform espera um iterável de documentos
    vetor_denso = vetor.toarray()
    tensor_entrada = torch.tensor(vetor_denso, dtype=torch.float32)

    with torch.no_grad():
        saida = modelo(tensor_entrada)
        previsao_indice = torch.argmax(saida, dim=1).item()

    return indice_para_rotulo[previsao_indice]


if __name__ == "__main__":
    resultado = classificar_arquivo("C:/Users/USUARIO/Desktop/Meus Arquivos no geral/artigos IC/Kim.pdf")
    print(f"Categoria prevista: {resultado}")