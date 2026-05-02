import comunicacao.api_client as client
from comunicacao.reportar_evento import reportar_evento
from core.licenca import validar_licenca
from core.agendador import iniciar_agendador

api = False

if __name__ == '__main__':
    print('\nIniciando agente Efficience...\n')

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
        print("[Sem conexão com o servidor ~ impossivel validar licença]")
        print(e)
    except Exception as e:
        print(f"Erro inesperado: {e}")
        reportar_evento(f"Não foi possível validar a licença: {e}", False)