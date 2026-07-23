import os
import re
from datetime import datetime
from core.identificar_tipo import obter_tipo

def renomear_arquivo(origem):
    nome = os.path.basename(origem)
    nome_sem_ext, ext = os.path.splitext(nome)
    
    tipo, precisa_renomear = obter_tipo(origem)
    
    if not precisa_renomear:
        return nome  # já tem tipo no nome — não renomeia
    
    # remove timestamp anterior se já existir
    # remove prefixo antigo: YYYYMMDD_HHMMSS_
    nome_sem_ext = re.sub(r'^\d{8}_\d{6}_', '', nome_sem_ext)
    # remove prefixo novo: tipo_DDMMYY_HHMMSS_
    nome_sem_ext = re.sub(r'^[a-z_]+_\d{6}_\d{6}_', '', nome_sem_ext)
    
    timestamp = datetime.now().strftime("%d%m%y_%H%M%S")
    nome_novo = f"{tipo}_{timestamp}_{nome_sem_ext}{ext}"
    destino = os.path.join(os.path.dirname(origem), nome_novo)

    if os.path.exists(destino):
        contador = 1
        while True:
            nome_novo = f"{tipo}_{timestamp}_{nome_sem_ext}_{contador}{ext}"
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
    