import requests
import os
from dotenv import load_dotenv
load_dotenv()

from core.licenca import validar_licenca
from core.configuracao import buscar_configuracoes
from core.agendador import iniciar_agendador

headers = {"Authorization": "Bearer TOKEN"}

url = os.environ["API_URL"]

try:
    requests.get(url, timeout=6)
    print("API ligada")
except requests.RequestException:
    print("API desligada")

'''
if __name__ == '__main__':
    print('Iniciando agente Efficience...')

    if not validar_licenca():
        print('Licença inativa. Agente encerrado.')
        exit(1)

    configuracoes = buscar_configuracoes()
    iniciar_agendador(configuracoes)
'''
    