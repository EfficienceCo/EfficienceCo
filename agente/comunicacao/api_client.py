from dotenv import load_dotenv
import os
import requests

load_dotenv()

API_URL = os.getenv('API_URL', 'http://localhost:3001')
TOKEN = os.getenv('AUTH_TOKEN', '')

if not TOKEN:
    raise EnvironmentError("AUTH_TOKEN não definido nas variáveis de ambiente")

def _headers():
    return {
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "application/json"
    }

def _handle_response(response):
    response.raise_for_status()
    return response

def get(endpoint, timeout=None):
    url = API_URL + endpoint
    try:
        response = requests.get(url, headers=_headers(), timeout=timeout)
        return _handle_response(response)
    except requests.exceptions.Timeout:
        raise RuntimeError(f"Timeout em GET {endpoint}")
    except requests.exceptions.ConnectionError:
        raise RuntimeError(f"Falha de conexão em GET {endpoint}")
    except requests.exceptions.HTTPError as e:
        raise RuntimeError(f"Erro HTTP {e.response.status_code} em GET {endpoint}")

def post(endpoint, dados, timeout=None):
    url = API_URL + endpoint
    try:
        response = requests.post(url, headers=_headers(), json=dados, timeout=timeout)
        return _handle_response(response)
    except requests.exceptions.Timeout:
        raise RuntimeError(f"Timeout em POST {endpoint}")
    except requests.exceptions.ConnectionError:
        raise RuntimeError(f"Falha de conexão em POST {endpoint}")
    except requests.exceptions.HTTPError as e:
        raise RuntimeError(f"Erro HTTP {e.response.status_code} em POST {endpoint}")
    