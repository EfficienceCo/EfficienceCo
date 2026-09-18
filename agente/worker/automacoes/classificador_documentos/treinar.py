from sklearn.feature_extraction.text import TfidfVectorizer #tratar textos 
import re # usar para normalizar números
import torch # rede neural pytorch
from sklearn.model_selection import train_test_split # para seprar conjuntos de teste treino 
from torch.utils.data import Dataset, DataLoader #separa e carrega o dataset
import torch.nn as nn #criar as camadas da rede neural
import torch.optim as optim
from dataset import carregar_dataset

dataset = carregar_dataset("dataset")

def normalizar_numeros(texto: str) -> str:
    return re.sub(r"\d+", " NUM ", texto)


STOPWORDS_PT = [
    "de", "da", "do", "das", "dos", "em", "e", "a", "o", "as", "os",
    "para", "com", "por", "que", "um", "uma", "ao", "no", "na",
]

textos = []
rotulos = []
for item in dataset:
    texto = item[0]
    rotulo = item[1]
    textos.append(texto)
    rotulos.append(rotulo)


textos_normalizados = [normalizar_numeros(t) for t in textos]

vetorizador = TfidfVectorizer(token_pattern=r"(?u)\b[a-zA-ZÀ-ÿ]{2,}\b",  # só letras (com acentos), ignora números
    stop_words=STOPWORDS_PT,
) # mudança para nao levar em consideração os números, só letras tirando as da STOPWORD_PT
X = vetorizador.fit_transform(textos_normalizados)

print(X.shape) # (18,n) -> 18 documentos e n palavras no vocabulário
print(vetorizador.get_feature_names_out()[:15])

categorias = sorted (set(rotulos))
#remove duplicatas(set) e determina ordem alfabetica(sorted)

rotulo_para_indice = {categoria: i for i, categoria in enumerate(categorias)} # coloca indice em cada categoria

y= [rotulo_para_indice[r] for r in rotulos] # percorre todos os rotulos e substitui eles pelos indices

X_denso = X.toarray()

X_treino, X_teste, y_treino, y_teste = train_test_split(X_denso, y, test_size=0.2,stratify=y,random_state=42,)

X_treino_tensor = torch.tensor(X_treino, dtype=torch.float32)
y_treino_tensor = torch.tensor(y_treino, dtype=torch.long)
X_teste_tensor = torch.tensor(X_teste, dtype=torch.float32)
y_teste_tensor = torch.tensor(y_teste, dtype=torch.long)

class DocumentosDataset(Dataset):
    def __init__(self, X, y):
        self.X = X
        self.y = y

    def __len__(self):
        return len(self.X)

    def __getitem__(self, idx):
        return self.X[idx], self.y[idx]

dataset_treino = DocumentosDataset(X_treino_tensor, y_treino_tensor)
dataset_teste = DocumentosDataset(X_teste_tensor, y_teste_tensor)

loader_treino = DataLoader(dataset_treino, batch_size=4, shuffle = True)
loader_teste = DataLoader(dataset_teste, batch_size = 4, shuffle = False )
    
class ClassificadorDocumentos(nn.Module):
    def __init__(self, tamanho_entrada, tamanho_oculto, numero_classes):
        super().__init__()
        self.camada1 = nn.Linear(tamanho_entrada, tamanho_oculto)
        self.ativacao = nn.ReLU()
        self.camada2 = nn.Linear(tamanho_oculto, numero_classes)

    def forward(self, x ):
        x = self.camada1(x)
        x = self.ativacao(x)
        x = self.camada2(x)
        return x

modelo = ClassificadorDocumentos(
    tamanho_entrada = X_treino_tensor.shape[1],
    tamanho_oculto=32,
    numero_classes=len(categorias),
)


funcao_perda = nn.CrossEntropyLoss()
otimizador = optim.Adam(modelo.parameters(), lr=0.001)

numero_epocas = 30

for epoca in range(numero_epocas):
    perda_total = 0.0

    for batch_X, batch_y in loader_treino:
        otimizador.zero_grad()

        saida = modelo(batch_X)
        perda = funcao_perda(saida, batch_y)

        perda.backward()
        otimizador.step()

        perda_total += perda.item()

    print(f"Época {epoca+1}/{numero_epocas} — perda: {perda_total:.4f}")

modelo.eval()

acertos = 0
total = 0

with torch.no_grad():
    for batch_X, batch_y in loader_teste:
        saida = modelo(batch_X)
        previsoes = torch.argmax(saida, dim=1)

        acertos += (previsoes == batch_y).sum().item()
        total += batch_y.size(0)

acuracia = acertos / total
print(f"Acurácia no teste: {acuracia:.2%} ({acertos}/{total})")

import joblib

torch.save(modelo.state_dict(), "modelo.pt")
joblib.dump(vetorizador, "vetorizador.joblib")
joblib.dump(rotulo_para_indice, "indice_para_rotulo.joblib")

