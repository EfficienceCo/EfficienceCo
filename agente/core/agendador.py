import time
import threading
from core.configuracao import gerenciar_configuracoes, extrair_pastas, verificar_atualizacao, INTERVALO_POLLING_SEGUNDOS
from core.licenca import validar_licenca
from automacoes.monitorar_pasta import iniciar_monitoramento

INTERVALO_LICENCA_HORAS = 24

def _revalidar_licenca():
    while True:
        time.sleep(INTERVALO_LICENCA_HORAS * 3600)
        licenca = validar_licenca()
        if licenca != "ativa":
            print("[agendador] Licença inválida. Encerrando agente.")
            exit(1)
        print("[agendador] Licença revalidada.")

def _polling_regras():
    while True:
        time.sleep(INTERVALO_POLLING_SEGUNDOS)
        verificar_atualizacao()

def iniciar_agendador():
    regras = gerenciar_configuracoes()
    pastas = extrair_pastas(regras)

    threading.Thread(target=_revalidar_licenca, daemon=True).start()
    threading.Thread(target=_polling_regras, daemon=True).start()

    iniciar_monitoramento(regras, pastas)
