import comunicacao.api_client as client
from core.licenca import validar_licenca
from core.configuracao import buscar_configuracoes
from core.agendador import iniciar_agendador

api = False

if __name__ == '__main__':
    print('Iniciando agente Efficience...')

    try:
        #verificação API
        client.get("/health", 6)
        print("Comunicando com o servidor")
        api = True

        licenca = validar_licenca()

        #validação licença
        if licenca == "ativa":
            print('Licença válida')
        elif licenca == "inativa":
            print('Licença inativa. Agente encerrado.')
            exit(1)
            
    #configuracoes = buscar_configuracoes()
    #iniciar_agendador(configuracoes)
    except RuntimeError as e:
        print(e)
    except Exception as e:
        print(f"Erro inesperado: {e}")