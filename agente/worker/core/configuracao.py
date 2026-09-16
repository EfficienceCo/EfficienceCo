import comunicacao.api_client as client
from pathlib import Path
from datetime import datetime, timedelta
import json
import os
import time

CACHE_PATH = Path.home() / ".config" / "efficience" / "regras.json"
CACHE_TTL_HORAS = 24
INTERVALO_POLLING_SEGUNDOS = 30
# Se /versao falhar, força GET /regras completo neste intervalo (anti cache cego).
INTERVALO_SYNC_FORCADO_SEGUNDOS = 300

# Inbox de XMLs sob a base do escritório (já injetada pelo launcher).
# TODO(João): se precisarmos de path configurável, expor pasta_nfe no backend.
PASTA_NFE_RELATIVA = "NFe"

_ultimo_sync_forcado_em = 0.0


def _cache_existe():
    return os.path.exists(CACHE_PATH)


def _ler_cache():
    try:
        with open(CACHE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return None


def _cache_existe_com_regras():
    if not _cache_existe():
        return False
    cache = _ler_cache()
    return cache is not None and "regras" in cache


def _cache_antigo():
    """True se o cache tem mais de CACHE_TTL_HORAS (aviso offline; não bloqueia sync)."""
    cache = _ler_cache()
    if cache is None or "timestamp" not in cache:
        return True
    try:
        timestamp = datetime.fromisoformat(cache["timestamp"])
    except (TypeError, ValueError):
        return True
    return datetime.now() - timestamp >= timedelta(hours=CACHE_TTL_HORAS)


def _salvar_cache(regras, versao=None):
    os.makedirs(os.path.dirname(CACHE_PATH), exist_ok=True)
    with open(CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump({
            "timestamp": datetime.now().isoformat(),
            "versao": versao,
            "regras": regras
        }, f, indent=2)


def _buscar_configuracoes():
    response = client.get(
        f"/regras/{client.CLIENTE_ID}",
        addToHeaders={"x-licenca-token": client.LICENSE_TOKEN},
    )
    return response.json()


def _buscar_versao():
    response = client.get(
        f"/regras/{client.CLIENTE_ID}/versao",
        addToHeaders={"x-licenca-token": client.LICENSE_TOKEN},
    )
    return response.json().get("versao")


def _versao_cache():
    if not _cache_existe():
        return None
    cache = _ler_cache()
    if cache is None:
        return None
    return cache.get("versao")


def _regras_cache_brutas():
    cache = _ler_cache()
    if cache is None:
        return None
    return cache.get("regras")


def _regras_iguais(a, b):
    return json.dumps(a, sort_keys=True, default=str) == json.dumps(
        b, sort_keys=True, default=str
    )


def _buscar_e_salvar(versao=None):
    """Baixa regras e grava cache com versão (busca /versao se não informada)."""
    regras = _buscar_configuracoes()
    if versao is None:
        try:
            versao = _buscar_versao()
        except RuntimeError:
            versao = _versao_cache()
    _salvar_cache(regras, versao)
    return regras


def extrair_pastas(regras):
    pasta_base = (client.PASTA_BASE or "").strip()
    if pasta_base:
        return {pasta_base}  # watchdog monitora a raiz, regras fazem o filtro

    # comportamento antigo — sem PASTA_BASE
    pastas = set(r["pasta_origem"] for r in regras if r.get("ativa") and r.get("pasta_origem"))
    if not pastas:
        pasta_padrao = (os.getenv("PASTA_PADRAO") or "").strip()
        if pasta_padrao:
            return {pasta_padrao}
        return None
    return pastas


def _normalizar_caminho(caminho):
    if not caminho:
        return caminho

    # remove espaços/\n/\r/\t residual de BD, formulário ou cache
    caminho = str(caminho).strip()
    if not caminho:
        return None

    pasta_base = client.PASTA_BASE
    if not pasta_base:
        return caminho

    pasta_base = str(pasta_base).strip()
    caminho_abs = os.path.abspath(caminho)
    base_abs = os.path.abspath(pasta_base)

    if caminho_abs.startswith(base_abs):
        return caminho
    return os.path.join(pasta_base, caminho.lstrip("/").lstrip(r"\\"))


def normalizar_regras(regras):
    # Cópia rasa para não mutar o cache em disco / listas compartilhadas.
    normalizadas = []
    for regra in regras:
        r = dict(regra)
        if r.get("pasta_origem"):
            r["pasta_origem"] = _normalizar_caminho(r["pasta_origem"])
        if r.get("pasta_destino"):
            r["pasta_destino"] = _normalizar_caminho(r["pasta_destino"])
        else:
            r["pasta_destino"] = r.get("pasta_destino") or None
        normalizadas.append(r)
    return normalizadas


# Alias interno (compatibilidade com imports legados / testes).
_normalizar_regras = normalizar_regras


def _sync_forcado_por_conteudo():
    """GET /regras completo; retorna regras se o conteúdo mudou, senão None."""
    global _ultimo_sync_forcado_em
    agora = time.monotonic()
    if agora - _ultimo_sync_forcado_em < INTERVALO_SYNC_FORCADO_SEGUNDOS:
        return None
    _ultimo_sync_forcado_em = agora

    try:
        regras = _buscar_configuracoes()
    except RuntimeError:
        print("[configuracao] Sync forçado falhou — mantendo regras atuais")
        return None

    antigas = _regras_cache_brutas()
    if antigas is not None and _regras_iguais(antigas, regras):
        # Atualiza timestamp / tenta versão, sem sinalizar hot-reload.
        try:
            versao = _buscar_versao()
        except RuntimeError:
            versao = _versao_cache()
        _salvar_cache(regras, versao)
        return None

    versao = None
    try:
        versao = _buscar_versao()
    except RuntimeError:
        versao = _versao_cache()

    print("[configuracao] Sync forçado — regras atualizadas da API")
    _salvar_cache(regras, versao)
    return regras


def verificar_atualizacao():
    """Poll de versão. Retorna regras novas (brutas) ou None se nada mudou.

    Se /versao falhar, cai no sync forçado periódico por conteúdo.
    """
    try:
        versao_api = _buscar_versao()
        if versao_api is None:
            return _sync_forcado_por_conteudo()
        if versao_api != _versao_cache():
            print("[configuracao] Novas regras detectadas — atualizando...")
            regras = _buscar_configuracoes()
            _salvar_cache(regras, versao_api)
            return regras
        return None
    except RuntimeError:
        print("[configuracao] Falha ao verificar versão — tentando sync forçado")
        return _sync_forcado_por_conteudo()


def gerenciar_configuracoes():
    """Hot path: lê cache se existir. Sync fica a cargo do poll / boot."""
    if _cache_existe_com_regras():
        cache = _ler_cache()
        if _cache_antigo():
            print("[configuracao] Cache antigo — poll/sync deve atualizar em breve")
        return _normalizar_regras(cache["regras"])

    try:
        regras = _buscar_e_salvar()
        print("[configuracao] Regras atualizadas da API")
        return _normalizar_regras(regras)
    except RuntimeError:
        if _cache_existe_com_regras():
            print("[configuracao] API indisponível — usando cache antigo")
            return _normalizar_regras(_ler_cache()["regras"])
        raise


def obter_pasta_nfe():
    """Pasta de entrada de XMLs de NF-e: {PASTA_BASE}/NFe.

    PASTA_BASE vem do launcher/config do escritório. O CNPJ da empresa atendida
    NÃO fica aqui — resolve-se via GET /clientes/por-cnpj a partir do XML.
    """
    pasta_base = (client.PASTA_BASE or "").strip()
    if not pasta_base:
        return None
    return str(Path(pasta_base) / PASTA_NFE_RELATIVA)


def obter_pasta_base():
    """Raiz de pastas do escritório (empresas em subpastas por nome)."""
    pasta_base = (client.PASTA_BASE or "").strip()
    return pasta_base or None
