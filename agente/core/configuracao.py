import comunicacao.api_client as client
from pathlib import Path
from datetime import datetime, timedelta
import json
import os

CACHE_PATH = Path.home() / ".config" / "efficience" / "regras.json"
CACHE_TTL_HORAS = 24

def _cache_existe():
    return os.path.exists(CACHE_PATH)

def _ler_cache():
    try:
        with open(CACHE_PATH, "r") as f:
            return json.load(f)
    except json.JSONDecodeError:
        return None

def _cache_valido():
    if not _cache_existe():
        return False
    cache = _ler_cache()
    if cache is None:  # arquivo corrompido
        return False
    timestamp = datetime.fromisoformat(cache["timestamp"])
    return datetime.now() - timestamp < timedelta(hours=CACHE_TTL_HORAS)

def _salvar_cache(regras):
    os.makedirs(os.path.dirname(CACHE_PATH), exist_ok=True)
    with open(CACHE_PATH, "w") as f:
        json.dump({
            "timestamp": datetime.now().isoformat(),
            "regras": regras
        }, f, indent=2)


def _buscar_configuracoes():
    try:
        response = client.get(f"/regras/{client.CLIENTE_ID}", addToHeaders={"x-licenca-token": client.LICENSE_TOKEN})
        regras = response.json()
        return regras
    except RuntimeError:
        raise

def gerenciar_configuracoes():      #pega as regras na API
    if _cache_valido():             
        print("[configuracao] Usando cache local")
        return _ler_cache()["regras"]
    
    try:
        regras = _buscar_configuracoes()
        _salvar_cache(regras)
        print("[configuracao] Regras atualizadas da API")
        return regras
    except RuntimeError:
        if _cache_existe():
            print("[configuracao] API indisponível — usando cache antigo")
            return _ler_cache()["regras"]
        raise

def extrair_pastas(regras):
    pastas = set(r["pasta_origem"] for r in regras if r.get("ativa")) #extrai as pastas que serão utilizadas nas regras
    
    if not pastas:
        pasta_padrao = os.getenv("PASTA_PADRAO")
        if pasta_padrao:
            return {pasta_padrao}
        return None
    
    return pastas
