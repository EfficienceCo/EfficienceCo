import comunicacao.api_client as client
from pathlib import Path
from datetime import datetime, timedelta
import json
import os

CACHE_PATH = Path.home() / ".config" / "efficience" / "regras.json"
CACHE_TTL_HORAS = 24
INTERVALO_POLLING_SEGUNDOS = 30

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
    if cache is None:
        return False
    timestamp = datetime.fromisoformat(cache["timestamp"])
    return datetime.now() - timestamp < timedelta(hours=CACHE_TTL_HORAS)

def _salvar_cache(regras, versao=None):
    os.makedirs(os.path.dirname(CACHE_PATH), exist_ok=True)
    with open(CACHE_PATH, "w") as f:
        json.dump({
            "timestamp": datetime.now().isoformat(),
            "versao": versao,
            "regras": regras
        }, f, indent=2)

def _buscar_configuracoes():
    response = client.get(f"/regras/{client.CLIENTE_ID}", addToHeaders={"x-licenca-token": client.LICENSE_TOKEN})
    return response.json()

def _buscar_versao():
    response = client.get(f"/regras/{client.CLIENTE_ID}/versao", addToHeaders={"x-licenca-token": client.LICENSE_TOKEN})
    return response.json().get("versao")

def _versao_cache():
    if not _cache_existe():
        return None
    cache = _ler_cache()
    if cache is None:
        return None
    return cache.get("versao")

def extrair_pastas(regras):
    pasta_base = client.PASTA_BASE
    if pasta_base:
        return {pasta_base}  # watchdog monitora a raiz, regras fazem o filtro
    
    # comportamento antigo — sem PASTA_BASE
    pastas = set(r["pasta_origem"] for r in regras if r.get("ativa"))
    if not pastas:
        pasta_padrao = os.getenv("PASTA_PADRAO")
        if pasta_padrao:
            return {pasta_padrao}
        return None
    return pastas
    
def _normalizar_caminho(caminho):
    if not caminho:
        return caminho
    
    pasta_base = client.PASTA_BASE
    if not pasta_base:        
        return caminho
    
    caminho_abs = os.path.abspath(caminho)
    base_abs = os.path.abspath(pasta_base)
    
    if caminho_abs.startswith(base_abs):
        return caminho
    return os.path.join(pasta_base, caminho.lstrip("/").lstrip(r"\\"))

def _normalizar_regras(regras):
    for regra in regras:
        regra["pasta_origem"] = _normalizar_caminho(regra["pasta_origem"])
        regra["pasta_destino"] = _normalizar_caminho(regra["pasta_destino"])
    return regras

def verificar_atualizacao():
    try:
        versao_api = _buscar_versao()
        if versao_api is None:
            return None
        if versao_api != _versao_cache():
            print("[configuracao] Novas regras detectadas — atualizando...")
            regras = _buscar_configuracoes()
            _salvar_cache(regras, versao_api)
            return regras
        return None
    except RuntimeError:
        print("[configuracao] Falha ao verificar versão — mantendo regras atuais")
        return None

def gerenciar_configuracoes():
    if _cache_valido():
        return _normalizar_regras(_ler_cache()["regras"])
    
    try:
        regras = _buscar_configuracoes()
        _salvar_cache(regras)  # salva caminhos originais — normaliza só em runtime
        print("[configuracao] Regras atualizadas da API")
        return _normalizar_regras(regras)
    except RuntimeError:
        if _cache_existe():
            print("[configuracao] API indisponível — usando cache antigo")
            return _normalizar_regras(_ler_cache()["regras"])
        raise
