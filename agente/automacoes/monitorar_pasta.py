from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from datetime import datetime
import time
import os

class MonitorPasta(FileSystemEventHandler):
    def __init__(self, regras):
        self.regras = regras

    def on_created(self, event):
        if event.is_directory:
            return
        
        nome = os.path.basename(event.src_path)
        if nome == "desktop.ini":
            return

        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{timestamp}] Arquivo detectado: {nome} em {event.src_path}")

def iniciar_monitoramento(regras, pastas):
    observer = Observer()
    pastas_registradas = 0

    for pasta in pastas:
        if not os.path.exists(pasta):
            try:
                os.makedirs(pasta)
                print(f"[monitor] Pasta criada: {pasta}")
            except PermissionError:
                print(f"[monitor] Sem permissão para criar: {pasta}")
                continue
            except Exception as e:
                print(f"[monitor] Erro ao criar pasta {pasta}: {e}")
                continue

        try:
            observer.schedule(MonitorPasta(regras), path=pasta, recursive=True)
            print(f"[monitor] Monitorando: {pasta}")
            pastas_registradas += 1
        except PermissionError:
            print(f"[monitor] Sem permissão para acessar: {pasta}")
        except Exception as e:
            print(f"[monitor] Erro ao registrar pasta {pasta}: {e}")

    if pastas_registradas == 0:
        pasta_padrao = os.getenv("PASTA_PADRAO")
        if pasta_padrao:
            os.makedirs(pasta_padrao, exist_ok=True)
            observer.schedule(MonitorPasta(regras), path=pasta_padrao, recursive=True)
            print(f"[monitor] Nenhuma pasta das regras disponível — usando fallback: {pasta_padrao}")
        else:
            print("[monitor] Nenhuma pasta disponível e PASTA_PADRAO não definida. Agente idle.")
            return

    observer.start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()

    observer.join()
    