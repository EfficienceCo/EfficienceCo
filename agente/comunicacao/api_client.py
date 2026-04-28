from dotenv import load_dotenv
import os
import requests

load_dotenv()

API_URL = os.getenv('API_URL', 'http://localhost:3001')
TOKEN = os.getenv('AUTH_TOKEN', '')
LICENSE_TOKEN = os.getenv('LICENSE_TOKEN')

if not TOKEN:
    raise EnvironmentError("AUTH_TOKEN não definido nas variáveis de ambiente")

def _headers(extra=None):
    headers = {
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "application/json"
    }

    if extra:
        headers.update(extra)

    return headers

def _handle_response(response, method, endpoint):
    if not response.ok:
        try:
            mensagem = response.json().get("message", "Erro desconhecido")
        except Exception:
            mensagem = response.text or "Erro desconhecido"
        raise RuntimeError(f"Erro {response.status_code} em {method} {endpoint}: {mensagem}")
    return response

def get(endpoint, timeout=None, addToHeaders=None):
    url = API_URL + endpoint
    try:
        response = requests.get(url, headers=_headers(addToHeaders), timeout=timeout)
        return _handle_response(response, "GET", endpoint)
    except requests.exceptions.Timeout:
        raise RuntimeError(f"Timeout em GET {endpoint}")
    except requests.exceptions.ConnectionError:
        raise RuntimeError(f"Falha de conexão em GET {endpoint}")
    except RuntimeError:
        raise

def post(endpoint, dados, timeout=None, addToHeaders=None):
    url = API_URL + endpoint
    try:
        response = requests.post(url, headers=_headers(addToHeaders), json=dados, timeout=timeout)
        return _handle_response(response, "POST", endpoint)
    except requests.exceptions.Timeout:
        raise RuntimeError(f"Timeout em POST {endpoint}")
    except requests.exceptions.ConnectionError:
        raise RuntimeError(f"Falha de conexão em POST {endpoint}")
    except RuntimeError:
        raise
