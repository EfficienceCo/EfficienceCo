import os
import sys
import io
import torch
import torch.nn as nn
from torchvision import transforms, models
import pypdfium2 as pdfium 
import pandas as pd
import matplotlib.pyplot as plt
from PIL import Image

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_MODEL_PATH = os.path.join(BASE_DIR, 'classificador_documentos.pth')

CLASS_NAMES = ['cartao_cnpj', 'contrato_social', 'extrato_bancario', 'holerite']

def excel_para_imagem_pil(excel_path):
    """Lê as primeiras linhas do Excel e renderiza como imagem PIL."""
    # Lê as primeiras 20 linhas da primeira aba do Excel
    df = pd.read_excel(excel_path, nrows=20)
    
    # Cria uma figura do Matplotlib sem eixos
    fig, ax = plt.subplots(figsize=(8, 6))
    ax.axis('off')
    
    # Desenha a tabela
    tabela = ax.table(cellText=df.values, colLabels=df.columns, loc='center', cellLoc='left')
    tabela.auto_set_font_size(False)
    tabela.set_fontsize(8)
    tabela.scale(1.2, 1.2)
    
    # Salva em um buffer na memória como PNG
    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', dpi=150)
    plt.close(fig)
    buf.seek(0)
    
    # Retorna como imagem PIL RGB
    return Image.open(buf).convert('RGB')

def classificar_documento(arquivo_path, model_path=DEFAULT_MODEL_PATH, threshold=0.75):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    
    model_path_abs = os.path.abspath(model_path)
    if not os.path.exists(model_path_abs):
        return {"erro": f"O arquivo de modelo '{model_path_abs}' não existe."}

    extensao = os.path.splitext(arquivo_path)[1].lower()

    # 1. Carregamento e Conversão para Imagem PIL conforme a extensão
    try:
        if extensao == '.pdf':
            pdf = pdfium.PdfDocument(arquivo_path)
            if len(pdf) == 0:
                return {"erro": "O PDF está vazio."}
            page = pdf[0]
            imagem_pil = page.render(scale=2).to_pil().convert('RGB')
            
        elif extensao in ['.xlsx', '.xls']:
            imagem_pil = excel_para_imagem_pil(arquivo_path)
            
        elif extensao in ['.png', '.jpg', '.jpeg']:
            imagem_pil = Image.open(arquivo_path).convert('RGB')
            
        else:
            return {"erro": f"Extensão '{extensao}' não suportada. Use PDF, XLSX, XLS ou imagens."}
            
    except Exception as e:
        return {"erro": f"Erro ao processar o arquivo: {str(e)}"}

    # 2. Pré-processamento
    preprocess = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
    ])
    
    tensor_entrada = preprocess(imagem_pil).unsqueeze(0).to(device)

    # 3. Carregar modelo e Inferência
    model = models.resnet18()
    model.fc = nn.Linear(model.fc.in_features, len(CLASS_NAMES))
    model.load_state_dict(torch.load(model_path_abs, map_location=device))
    model.to(device)
    model.eval()

    with torch.no_grad():
        outputs = model(tensor_entrada)
        probabilidades = torch.nn.functional.softmax(outputs, dim=1)
        confianca_maxima, pred_idx = torch.max(probabilidades, 1)
        
    confianca = confianca_maxima.item()
    classe_index = pred_idx.item()

    if confianca >= threshold:
        classe_final = CLASS_NAMES[classe_index]
    else:
        classe_final = "nao_identificado"

    return {
        "classe": classe_final,
        "confianca": round(confianca * 100, 2),
        "limiar_usado": threshold
    }

if __name__ == "__main__":
    caminho_arquivo = sys.argv[1] if len(sys.argv) > 1 else os.path.join(BASE_DIR, "documento_teste.xlsx")
    
    if os.path.exists(caminho_arquivo):
        resultado = classificar_documento(caminho_arquivo, threshold=0.75)
        print("\n--- Resultado da Classificação ---")
        if "erro" in resultado:
            print(f"Erro: {resultado['erro']}")
        else:
            print(f"Classe Predita : {resultado['classe']}")
            print(f"Confiança      : {resultado['confianca']}%")
    else:
        print(f"Arquivo não encontrado: '{caminho_arquivo}'")