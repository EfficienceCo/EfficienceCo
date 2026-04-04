from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from dotenv import load_dotenv
from datetime import datetime
import time
import os

# Carregar variáveis do .env
load_dotenv()

# Configurações
pasta = lambda p: os.path.basename(os.path.dirname(p))
arquivo = os.path.basename
caminho_pasta = os.environ["MONITOR_DIR"]
observer = Observer()

# Classe monitoramento
class MonitorPasta(FileSystemEventHandler):
    def on_created(self, event):
        if arquivo(event.src_path) != "desktop.ini":
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            tipo = "Pasta" if event.is_directory else "Arquivo"
            print(f"[{timestamp}] Novo(a) {tipo}: {arquivo(event.src_path)} em {pasta(event.src_path)}")
            print(f"[{event.src_path}]\n")

# Iniciar monitoramento
try:
    observer.schedule(MonitorPasta(), path=caminho_pasta, recursive=True)
    observer.start()
except FileNotFoundError as e:
    print(f"Pasta não encontrada: {caminho_pasta}")
    raise
except PermissionError as e:
    print("Sem permissão para acessar a pasta")
    raise ValueError("Configure as permissões corretas") from e
except Exception as e:
    print(f"Erro inesperado: {e}")
    raise RuntimeError("Falha crítica no monitoramento") from e

try:
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    observer.stop()

observer.join()
