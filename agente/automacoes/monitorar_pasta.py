from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from automacoes.mover_arquivo import mover_arquivo
from comunicacao.reportar_evento import reportar_evento
from core.configuracao import gerenciar_configuracoes
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
        print(f"\n[{timestamp}] Arquivo detectado: {nome}")

        try:
            regras = gerenciar_configuracoes()
        except Exception:
            print(f"[{timestamp}] Falha ao buscar regras — usando regras da inicialização")
            regras = self.regras

        _processar_arquivo(event.src_path, regras)

def _processar_arquivo(caminho, regras):
    nome = os.path.basename(caminho)
    for regra in regras:
        if not regra.get("ativa"):
            continue
        if _arquivo_pertence_origem(caminho, regra["pasta_origem"]):
            if _bate_condicao(caminho, regra["condicao"]):
                try:
                    nome_final = mover_arquivo(caminho, regra)
                    print(f"[monitor] Arquivo movido: {nome} → {regra['pasta_destino']}")
                    reportar_evento(
                        f"Arquivo {nome_final} movido para {regra['pasta_destino']}",
                        True
                    )
                except RuntimeError as e:
                    print(f"[monitor] Falha ao mover: {nome} — {e}")
                    reportar_evento(f"Falha ao mover {nome}: {e}", False)
                return

def _arquivo_pertence_origem(caminho, pasta_origem):
    return os.path.dirname(os.path.abspath(caminho)) == os.path.abspath(pasta_origem)

def _bate_condicao(caminho, condicao):
    if condicao.startswith("extensao="):
        ext = condicao.split("=")[1]
        return caminho.endswith(ext)
    return False

def _varredura_inicial(regras, pasta):
    print(f"[monitor] Buscando arquivos existentes em: {pasta}")
    for nome in os.listdir(pasta):
        caminho = os.path.join(pasta, nome)
        if os.path.isfile(caminho) and nome != "desktop.ini":
            print(f"\n[monitor] Arquivo encontrado na varredura: {nome}")
            _processar_arquivo(caminho, regras)

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
            _varredura_inicial(regras, pasta)
            print(f"\n[monitor] Monitorando: {pasta}")
            pastas_registradas += 1
        except PermissionError:
            print(f"\n[monitor] Sem permissão para acessar: {pasta}")
        except Exception as e:
            print(f"\n[monitor] Erro ao registrar pasta {pasta}: {e}")

    if pastas_registradas == 0:
        pasta_padrao = os.getenv("PASTA_PADRAO")
        if pasta_padrao:
            os.makedirs(pasta_padrao, exist_ok=True)
            observer.schedule(MonitorPasta(regras), path=pasta_padrao, recursive=True)
            _varredura_inicial(regras, pasta_padrao)
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
