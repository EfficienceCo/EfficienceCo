import os
import re
from datetime import datetime

def renomear_arquivo(origem):
    nome = os.path.basename(origem)
    nome_sem_ext, ext = os.path.splitext(nome)
    
    # remove timestamp anterior se já existir
    nome_sem_ext = re.sub(r'_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(\-\d+)?$', '', nome_sem_ext)
    
    timestamp = datetime.now().strftime("%Y-%m-%dT%H-%M-%S")
    nome_novo = f"{nome_sem_ext}_{timestamp}{ext}"
    destino = os.path.join(os.path.dirname(origem), nome_novo)

    if os.path.exists(destino):
        timestamp2 = datetime.now().strftime("%Y-%m-%dT%H-%M-%S-%f")
        nome_novo = f"{nome_sem_ext}_{timestamp2}{ext}"
        destino = os.path.join(os.path.dirname(origem), nome_novo)

    try:
        os.rename(origem, destino)
        return os.path.basename(destino)
    except PermissionError:
        raise RuntimeError(f"Sem permissão para renomear {nome}")
    except Exception as e:
        raise RuntimeError(f"Erro ao renomear {nome}: {e}")
    