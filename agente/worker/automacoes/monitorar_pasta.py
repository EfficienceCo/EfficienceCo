from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from automacoes.mover_arquivo import mover_arquivo
from comunicacao.reportar_evento import reportar_evento
from core.configuracao import gerenciar_configuracoes
from automacoes.renomear_arquivo import renomear_arquivo
from automacoes.abertura_empresa import criar_estrutura_empresa
from automacoes.organizar_arquivo import organizar_arquivo
from automacoes.upload_folha import (
    eh_planilha_folha,
    enviar_planilha_folha,
    PlanilhaRejeitadaError,
)
from core.identificar_tipo import identificar_tipo_no_nome
from core.estrutura_pastas import PASTA_NAO_CLASSIFICADO
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

        # evita loop ao mover para NAO_CLASSIFICADO sob a pasta monitorada
        partes = os.path.normpath(event.src_path).split(os.sep)
        if PASTA_NAO_CLASSIFICADO in partes:
            return

        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"\n[{timestamp}] Arquivo detectado em {os.path.dirname(event.src_path)}: {nome}")

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
                acao = regra.get("acao")
                try:
                    if acao == "mover":
                        nome_final = mover_arquivo(caminho, regra)
                    elif acao == "renomear":
                        nome_final = renomear_arquivo(caminho)
                    elif acao == "organizar_arquivo":
                        nome_final = organizar_arquivo(caminho, regra)
                    elif acao == "abertura_empresa":
                        nome_final = criar_estrutura_empresa(regra)
                    elif acao == "upload_folha":
                        if not eh_planilha_folha(caminho):
                            print(
                                f"[monitor] Ignorando {nome}: upload_folha exige "
                                f".xlsx diretamente em Folha/YYYY-MM (não em subpastas)"
                            )
                            return
                        try:
                            mes, nome_final = enviar_planilha_folha(
                                caminho,
                                pasta_destino=regra.get("pasta_destino") or None,
                            )
                        except PlanilhaRejeitadaError as e:
                            destino = e.caminho_arquivado or caminho
                            print(f"[monitor] Planilha de folha rejeitada: {nome} — {e}")
                            reportar_evento(
                                f"Planilha {os.path.basename(destino)} rejeitada pelo servidor: {e}",
                                False,
                            )
                            return
                        print(f"[monitor] Planilha de folha enviada: {nome} (mês {mes}) → {nome_final}")
                        reportar_evento(
                            f"Planilha {os.path.basename(nome_final)} enviada para folha ({mes})",
                            True,
                        )
                        return
                    else:
                        print(f"[monitor] Ação desconhecida: {acao}")
                        return
                    print(f"[monitor] Arquivo {acao}: {nome} → {nome_final}")
                    reportar_evento(
                        f"Arquivo {nome_final} processado ({acao}) em {regra['pasta_origem']}",
                        True
                    )
                except RuntimeError as e:
                    print(f"[monitor] Falha ao processar: {nome} — {e}")
                    reportar_evento(f"Falha ao processar {nome}: {e}", False)
                return

def _arquivo_pertence_origem(caminho, pasta_origem):
    return os.path.abspath(caminho).startswith(os.path.abspath(pasta_origem))

def _bate_condicao(caminho, condicao):
    # condicao pode ser string (legado) ou dict (novo formato JSONB)
    if not condicao:
        return True
    if isinstance(condicao, str):
        return _bate_condicao_legado(caminho, condicao)
    return _bate_condicao_estruturada(caminho, condicao)

def _bate_condicao_legado(caminho, condicao):
    if condicao.startswith("extensao="):
        ext = condicao.split("=")[1]
        return caminho.endswith(ext)
    return False

def _bate_condicao_estruturada(caminho, condicao):

    # tipo
    if condicao.get("tipo"):
        nome = os.path.basename(caminho)
        tipo_no_nome = identificar_tipo_no_nome(nome)
        if tipo_no_nome != condicao["tipo"].lower():
            return False
    
    # extensao
    if condicao.get("extensao"):
        if not caminho.endswith(f".{condicao['extensao']}"):
            return False
    
    # in_name
    if condicao.get("in_name"):
        nome = os.path.basename(caminho).lower()
        if condicao["in_name"].lower() not in nome:
            return False
    
    # tamanho
    if condicao.get("tamanho"):
        tamanho = os.path.getsize(caminho)
        if "min" in condicao["tamanho"] and tamanho < condicao["tamanho"]["min"]:
            return False
        if "max" in condicao["tamanho"] and tamanho > condicao["tamanho"]["max"]:
            return False
    
    # criado_em
    if condicao.get("criado_em"):
        criado = datetime.fromtimestamp(os.path.getctime(caminho))
        if "antes" in condicao["criado_em"] and criado > datetime.fromisoformat(condicao["criado_em"]["antes"]):
            return False
        if "depois" in condicao["criado_em"] and criado < datetime.fromisoformat(condicao["criado_em"]["depois"]):
            return False

    # recebido_em — usa mtime (data de modificação/recebimento)
    if condicao.get("recebido_em"):
        recebido = datetime.fromtimestamp(os.path.getmtime(caminho))
        if "antes" in condicao["recebido_em"] and recebido > datetime.fromisoformat(condicao["recebido_em"]["antes"]):
            return False
        if "depois" in condicao["recebido_em"] and recebido < datetime.fromisoformat(condicao["recebido_em"]["depois"]):
            return False

    return True

def _varredura_inicial(regras, pasta):
    pastas_origem = set(
        r["pasta_origem"] for r in regras 
        if r.get("ativa") and r.get("pasta_origem")
    )
    for p in pastas_origem:
        print(f"[monitor] Varrendo arquivos existentes em: {p}")
    
    for raiz, dirs, arquivos in os.walk(pasta):
        for nome in arquivos:
            if nome == "desktop.ini":
                continue
            caminho = os.path.join(raiz, nome)
            print(f"[monitor] Arquivo encontrado na varredura: {nome}")
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
            print(f"[monitor] Monitorando: {pasta}")
            
            # mostra subpastas monitoradas via regras
            subpastas = set(
                r["pasta_origem"] for r in regras 
                if r.get("ativa") and r.get("pasta_origem") and 
                os.path.abspath(r["pasta_origem"]).startswith(os.path.abspath(pasta))
            )
            for sub in subpastas:
                print(f"[monitor] ↳ {sub}")
            
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
