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

def iniciar_agendador():
    regras = gerenciar_configuracoes()
    pastas = extrair_pastas(regras)
    print(f"[configuracao] {len(regras)} regra(s) carregada(s)")

    _agendar_tarefas_diarias()

    threading.Thread(target=_revalidar_licenca, daemon=True).start()
    threading.Thread(target=_polling_regras, daemon=True).start()
    threading.Thread(target=_loop_schedule, daemon=True).start()
    threading.Thread(target=_retry_fila, daemon=True).start()

    iniciar_monitoramento(regras, pastas)
