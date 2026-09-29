import comunicacao.api_client as client
from comunicacao.reportar_evento import reportar_evento
from core.encoding_console import garantir_stdout_utf8
from core.log_arquivo import iniciar_log_arquivo
from core.licenca import validar_licenca
from core.agendador import iniciar_agendador

api = False

if __name__ == '__main__':
    # Antes de qualquer print: Windows cp1252 / launcher sem PYTHONUTF8 (BUG-NFE-01).
    garantir_stdout_utf8()
    # Sem console (windowsgui / CREATE_NO_WINDOW): espelha prints em worker.log (#486).
    log_path = iniciar_log_arquivo()
    print('\nIniciando agente Efficience...\n')
    if log_path:
        print(f'[log_arquivo] Persistindo em {log_path}\n')

    try:
        #verificação API
        client.get("/health", 6)
        print("[Conexão com servidor estabelecida]\n")
        api = True
        licenca = validar_licenca()

        #validação licença
        if licenca == "ativa":
            print('[Licença validada e ativa - Iniciando agente]\n')
            reportar_evento("[Licença validada e ativa - Iniciando agente]\n", True)
            iniciar_agendador()


        elif licenca == "inativa":
            print('[Licença inválida e inativa - Agente encerrado]')
            reportar_evento("[Licença inválida e inativa - Agente encerrado]", False)
            exit(1)
            
    #iniciar_agendador(configuracoes)
    except RuntimeError as e:
        print(e)
    except Exception as e:
        print(f"Erro inesperado: {e}")
        reportar_evento(f"Não foi possível validar a licença: {e}", False)