from dotenv import load_dotenv
import os
import requests

load_dotenv()

API_URL = os.getenv('API_URL', 'http://localhost:3001')
LICENSE_TOKEN = os.getenv('LICENSE_TOKEN')
PASTA_BASE = os.getenv("PASTA_BASE", "")
CLIENTE_ID = os.getenv('CLIENTE_ID')

def _headers(extra=None):
    headers = {"Content-Type": "application/json"}

    if extra:
        headers.update(extra)

    return headers

def _handle_response(response, method, endpoint):
    if not response.ok:
        try:
            body = response.json()
            mensagem = body.get("message") or body.get("erro") or "Erro desconhecido"
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

MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

def postFile(endpoint, arquivo_path, campos=None, timeout=None, addToHeaders=None):
    """POST multipart com arquivo no campo 'planilha' e campos de formulário extras."""
    url = API_URL + endpoint
    headers = {}
    if addToHeaders:
        headers.update(addToHeaders)

    nome = os.path.basename(arquivo_path)
    try:
        with open(arquivo_path, "rb") as f:
            files = {"planilha": (nome, f, MIME_XLSX)}
            response = requests.post(
                url,
                headers=headers,
                files=files,
                data=campos or {},
                timeout=timeout,
            )
        return _handle_response(response, "POST", endpoint)
    except requests.exceptions.Timeout:
        raise RuntimeError(f"Timeout em POST {endpoint}")
    except requests.exceptions.ConnectionError:
        raise RuntimeError(f"Falha de conexão em POST {endpoint}")
    except RuntimeError:
        raise
    except OSError as e:
        raise RuntimeError(f"Falha ao ler arquivo {arquivo_path}: {e}")
