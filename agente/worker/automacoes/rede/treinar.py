import os
import torch
import torch.nn as nn
import torch.optim as optim
from torchvision import datasets, transforms, models
from torch.utils.data import DataLoader

# 1. Âncora de diretório para resolver caminhos relativos ao PRÓPRIO MÓDULO
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Define o caminho do dataset e onde o modelo .pth será salvo
DATA_DIR = os.path.join(BASE_DIR, 'datasets')
MODEL_OUTPUT_PATH = os.path.join(BASE_DIR, 'classificador_documentos.pth')

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Executando no dispositivo: {device}")

# 2. Transformações nas imagens
data_transforms = {
    'train': transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.RandomRotation(15), 
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
    ]),
    'val': transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
    ]),
}

if not os.path.exists(DATA_DIR):
    print(f"Erro: Crie a pasta '{DATA_DIR}' com as subpastas de imagens ('train' e 'val') antes de treinar.")
    exit(1)

# 3. Carrega as pastas
image_datasets = {x: datasets.ImageFolder(os.path.join(DATA_DIR, x), data_transforms[x]) for x in ['train', 'val']}
dataloaders = {x: DataLoader(image_datasets[x], batch_size=16, shuffle=True) for x in ['train', 'val']}

class_names = image_datasets['train'].classes
print(f"Classes identificadas: {class_names}")

# 4. Modelo ResNet-18
model = models.resnet18(weights=models.ResNet18_Weights.DEFAULT)
for param in model.parameters():
    param.requires_grad = False

num_features = model.fc.in_features
model.fc = nn.Linear(num_features, len(class_names))
model = model.to(device)

criterion = nn.CrossEntropyLoss()
optimizer = optim.Adam(model.fc.parameters(), lr=0.001)

# 5. Loop de Treinamento
epochs = 5
for epoch in range(epochs):
    print(f"\nÉpoca {epoch+1}/{epochs}")
    for phase in ['train', 'val']:
        if phase == 'train':
            model.train()
        else:
            model.eval()
            
        running_loss = 0.0
        running_corrects = 0
        
        for inputs, labels in dataloaders[phase]:
            inputs, labels = inputs.to(device), labels.to(device)
            optimizer.zero_grad()
            
            with torch.set_grad_enabled(phase == 'train'):
                outputs = model(inputs)
                _, preds = torch.max(outputs, 1)
                loss = criterion(outputs, labels)
                
                if phase == 'train':
                    loss.backward()
                    optimizer.step()
            
            running_loss += loss.item() * inputs.size(0)
            running_corrects += torch.sum(preds == labels.data)
            
        epoch_loss = running_loss / len(image_datasets[phase])
        epoch_acc = running_corrects.double() / len(image_datasets[phase])
        print(f"  {phase.capitalize()} -> Loss: {epoch_loss:.4f} | Acurácia: {epoch_acc:.4f}")

# 6. Salva o modelo no caminho absoluto vinculado ao módulo
torch.save(model.state_dict(), MODEL_OUTPUT_PATH)
print(f"\nModelo treinado com sucesso! Arquivo salvo em: '{MODEL_OUTPUT_PATH}'")