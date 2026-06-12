import os
import time
import threading
import schedule
from comunicacao.fila_eventos import reenviar_fila, INTERVALO_RETRY_MINUTOS
from core.configuracao import gerenciar_configuracoes, extrair_pastas, verificar_atualizacao, INTERVALO_POLLING_SEGUNDOS
from core.licenca import validar_licenca
from automacoes.monitorar_pasta import iniciar_monitoramento
from automacoes.gerar_relatorio import gerar_relatorio

INTERVALO_LICENCA_HORAS = 24
HORARIO_RELATORIO = "18:00"

def _retry_fila():
    while True:
        time.sleep(INTERVALO_RETRY_MINUTOS * 60)
        reenviar_fila()

def _revalidar_licenca():
    while True:
        time.sleep(INTERVALO_LICENCA_HORAS * 3600)
        licenca = validar_licenca()
        if licenca != "ativa":
            print("[agendador] Licença inválida. Encerrando agente.")
            os._exit(1)
        print("[agendador] Licença revalidada.")

def _polling_regras():
    while True:
        time.sleep(INTERVALO_POLLING_SEGUNDOS)
        verificar_atualizacao()

def _agendar_tarefas_diarias():
    def _gerar_relatorio_seguro():
        try:
            gerar_relatorio()
        except Exception as e:
            print(f"[agendador] Erro ao gerar relatório: {e}")

    schedule.every().day.at(HORARIO_RELATORIO).do(_gerar_relatorio_seguro)
    print(f"[agendador] Relatório agendado para {HORARIO_RELATORIO}")

def _loop_schedule():
    while True:
        schedule.run_pending()
        time.sleep(30)

def _criar_pastas_regras(regras):
    pastas = set()
    for regra in regras:
        if regra.get("pasta_origem"):
            pastas.add(regra["pasta_origem"])
        if regra.get("pasta_destino"):
            pastas.add(regra["pasta_destino"])
    
    for pasta in pastas:
        try:
            if not os.path.exists(pasta):
                os.makedirs(pasta)
                print(f"[agendador] Pasta criada: {pasta}")
        except PermissionError:
            print(f"[agendador] Sem permissão para criar: {pasta}")
        except Exception as e:
            print(f"[agendador] Erro ao criar {pasta}: {e}")

def iniciar_agendador():
    regras = gerenciar_configuracoes()
    _criar_pastas_regras(regras)
    pastas = extrair_pastas(regras)
    print(f"[configuracao] {len(regras)} regra(s) carregada(s)")

    _agendar_tarefas_diarias()

    threading.Thread(target=_revalidar_licenca, daemon=True).start()
    threading.Thread(target=_polling_regras, daemon=True).start()
    threading.Thread(target=_loop_schedule, daemon=True).start()
    threading.Thread(target=_retry_fila, daemon=True).start()

    iniciar_monitoramento(regras, pastas)
