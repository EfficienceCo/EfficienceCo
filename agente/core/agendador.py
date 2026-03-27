import schedule
import time

def iniciar_agendador(configuracoes):
    # A implementar: agendar tarefas com base nas configurações
    while True:
        schedule.run_pending()
        time.sleep(1)
