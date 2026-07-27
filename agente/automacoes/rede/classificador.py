import torch
import torch.nn as nn
from torchvision import transforms, models
from PIL import Image
from pdf2image import convert_from_path
import os

# Classes exatas na ordem alfabética das pastas
CLASS_NAMES = ['cartao_cnpj', 'contrato_social', 'extrato_bancario', 'holerite']

def classificar_documento_pdf(pdf_path, model_path='classificador_documentos.pth', threshold=0.75):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    poppler_path = os.path.join(os.path.dirname(__file__), "poppler-22.04.0", "Library", "bin")
    
    if not os.path.exists(model_path):
        return {"erro": "O arquivo 'classificador_documentos.pth' não existe. Rode o 'treinar.py' primeiro."}
        
    try:
        paginas = convert_from_path(
            pdf_path,
            first_page=1,
            last_page=1,
            poppler_path=poppler_path,
        )
        if not paginas:
            return {"erro": "O PDF está vazio."}
        imagem_pil = paginas[0].convert('RGB')
    except Exception as e:
        return {"erro": f"Erro ao abrir o PDF: {str(e)}"}

    preprocess = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
    ])
    
    tensor_entrada = preprocess(imagem_pil).unsqueeze(0).to(device)

    # Carrega a arquitetura e os pesos treinados
    model = models.resnet18()
    model.fc = nn.Linear(model.fc.in_features, len(CLASS_NAMES))
    model.load_state_dict(torch.load(model_path, map_location=device))
    model.to(device)
    model.eval()

    with torch.no_grad():
        outputs = model(tensor_entrada)
        probabilidades = torch.nn.functional.softmax(outputs, dim=1)
        confianca_maxima, pred_idx = torch.max(probabilidades, 1)
        
    confianca = confianca_maxima.item()
    classe_index = pred_idx.item()

    # Aplicação da regra do limiar
    if confianca >= threshold:
        classe_final = CLASS_NAMES[classe_index]
    else:
        classe_final = "nao_identificado"

    return {
        "classe": classe_final,
        "confianca": round(confianca * 100, 2), # Retorna em porcentagem
        "limiar_usado": threshold
    }

# ==========================================
# TESTE DIRETO VIA TERMINAL
# ==========================================
if __name__ == "__main__":
    # Substitua pelo caminho do PDF que você quer testar
    caminho_pdf = r"C:\Users\USUARIO\Desktop\Arq Vinicius\teste\images (1).pdf"
    
    if os.path.exists(caminho_pdf):
        resultado = classificar_documento_pdf(caminho_pdf, threshold=0.75)
        print("\n--- Resultado da Classificação ---")
        if "erro" in resultado:
            print(f"Erro: {resultado['erro']}")
        else:
            print(f"Classe Predita : {resultado['classe']}")
            print(f"Confiança      : {resultado['confianca']}%")
    else:
        print(f"Coloque um PDF válido em '{caminho_pdf}' para rodar o teste.")
