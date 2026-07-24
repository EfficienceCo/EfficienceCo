import torch
import torch.nn as nn
from torchvision import transforms, models
from PIL import Image
from pdf2image import convert_from_path

# Mapeamento exato das pastas de treino (mantenha em ordem alfabética)
CLASS_NAMES = ['cartao_cnpj', 'contrato_social', 'extrato_bancario', 'holerite']

def classificar_documento_pdf(pdf_path, model_path='classificador_documentos.pth', threshold=0.75):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    
    # 1. Converte a primeira página do PDF para imagem em memória
    try:
        paginas = convert_from_path(pdf_path, first_page=1, last_page=1)
        if not paginas:
            return {"erro": "O arquivo PDF está vazio."}
        imagem_pil = paginas[0].convert('RGB')
    except Exception as e:
        return {"erro": f"Falha ao ler o PDF: {str(e)}"}

    # 2. Pré-processamento idêntico ao usado no treinamento
    preprocess = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
    ])
    
    tensor_entrada = preprocess(imagem_pil).unsqueeze(0).to(device)

    # 3. Recria a arquitetura da ResNet-18 e carrega os pesos salvos
    model = models.resnet18()
    model.fc = nn.Linear(model.fc.in_features, len(CLASS_NAMES))
    model.load_state_dict(torch.load(model_path, map_location=device))
    model.to(device)
    model.eval()

    # 4. Inferência (Desliga gradientes para performance)
    with torch.no_grad():
        outputs = model(tensor_entrada)
        # Transforma os scores brutos (logits) em probabilidades reais entre 0 e 1
        probabilidades = torch.nn.functional.softmax(outputs, dim=1)
        confianca_maxima, pred_idx = torch.max(probabilidades, 1)
        
    confianca = confianca_maxima.item()
    classe_index = pred_idx.item()

    # 5. Regra de Negócio: Verificação do Limiar de Confiança
    if confianca >= threshold:
        classe_final = CLASS_NAMES[classe_index]
    else:
        classe_final = "nao_identificado"

    return {
        "classe": classe_final,
        "confianca_obtida": round(confianca, 4),
        "limiar_configurado": threshold
    }

# --- COMO CHAMAR NO SEU SISTEMA ---
# resultado = classificar_documento_pdf("recebidos/documento_usuario_5.pdf")
# print(f"Resultado: {resultado['classe']} (Confiança: {resultado['confianca_obtida']*100}%)")