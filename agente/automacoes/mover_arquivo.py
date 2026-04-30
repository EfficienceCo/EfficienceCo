import os
import shutil
from datetime import datetime

def mover_arquivo(origem, regra):
    nome = os.path.basename(origem)
    destino = os.path.join(regra["pasta_destino"], nome)

    if os.path.exists(destino):
        nome_sem_ext, ext = os.path.splitext(nome)
        timestamp = datetime.now().strftime("%Y-%m-%dT%H-%M-%S")
        nome_novo = f"{nome_sem_ext}_{timestamp}{ext}"
        destino = os.path.join(regra["pasta_destino"], nome_novo)

    try:
        os.makedirs(regra["pasta_destino"], exist_ok=True)
        shutil.move(origem, destino)
        return os.path.basename(destino)
    except PermissionError:
        raise RuntimeError(f"Sem permissão para mover {nome}")
    except Exception as e:
        raise RuntimeError(f"Erro ao mover {nome}: {e}")
    