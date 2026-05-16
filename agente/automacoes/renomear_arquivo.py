import os
import re
from datetime import datetime

def renomear_arquivo(origem):
    nome = os.path.basename(origem)
    nome_sem_ext, ext = os.path.splitext(nome)
    
    # remove prefixo de timestamp anterior se já existir
    nome_sem_ext = re.sub(r'^\d{8}_\d{6}_', '', nome_sem_ext)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    nome_novo = f"{timestamp}_{nome_sem_ext}{ext}"
    destino = os.path.join(os.path.dirname(origem), nome_novo)

    if os.path.exists(destino):
        contador = 1
        while True:
            nome_novo = f"{timestamp}_{nome_sem_ext}_{contador}{ext}"
            destino = os.path.join(os.path.dirname(origem), nome_novo)
            if not os.path.exists(destino):
                break
            contador += 1

    try:
        os.rename(origem, destino)
        return os.path.basename(destino)
    except PermissionError:
        raise RuntimeError(f"Sem permissão para renomear {nome}")
    except Exception as e:
        raise RuntimeError(f"Erro ao renomear {nome}: {e}")
    