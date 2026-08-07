import os
import sys
import torch
import torch.nn as nn
from torchvision import transforms, models
import pypdfium2 as pdfium 

# 1. Âncora de diretório
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_MODEL_PATH = os.path.join(BASE_DIR, 'classificador_documentos.pth')

CLASS_NAMES = ['cartao_cnpj', 'contrato_social', 'extrato_bancario', 'holerite']

def classificar_documento_pdf(pdf_path, model_path=DEFAULT_MODEL_PATH, threshold=0.75):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    
    model_path_abs = os.path.abspath(model_path)
    if not os.path.exists(model_path_abs):
        return {"erro": f"O arquivo de modelo '{model_path_abs}' não existe. Execute o treinamento primeiro."}
        
    # 2. Renderização do PDF para Imagem nativa (Sem dependências externas)
    try:
        pdf = pdfium.PdfDocument(pdf_path)
        if len(pdf) == 0:
            return {"erro": "O PDF está vazio."}
        
        # Pega a primeira página (índice 0)
        page = pdf[0]
        # Renderiza a página como imagem PIL em RGB (scale=2 garante boa resolução)
        imagem_pil = page.render(scale=2).to_pil().convert('RGB')
        
    except Exception as e:
        return {"erro": f"Erro ao converter o PDF em imagem: {str(e)}"}

    # 3. Pré-processamento
    preprocess = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
    ])
    
    tensor_entrada = preprocess(imagem_pil).unsqueeze(0).to(device)

    # 4. Carregar o modelo
    model = models.resnet18()
    model.fc = nn.Linear(model.fc.in_features, len(CLASS_NAMES))
    model.load_state_dict(torch.load(model_path_abs, map_location=device))
    model.to(device)
    model.eval()

    # 5. Inferência
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
    caminho_pdf = sys.argv[1] if len(sys.argv) > 1 else os.path.join(BASE_DIR, "documento_teste.pdf")
    
    if os.path.exists(caminho_pdf):
        resultado = classificar_documento_pdf(caminho_pdf, threshold=0.75)
        print("\n--- Resultado da Classificação ---")
        if "erro" in resultado:
            print(f"Erro: {resultado['erro']}")
        else:
            print(f"Classe Predita : {resultado['classe']}")
            print(f"Confiança      : {resultado['confianca']}%")
    else:
        print(f"Arquivo não encontrado: '{caminho_pdf}'")