import comunicacao.api_client as client
from pathlib import Path
from datetime import datetime
import json
import os
import time

CACHE_PATH = Path.home() / ".config" / "efficience" / "regras.json"
INTERVALO_POLLING_SEGUNDOS = 30
TIMEOUT_REGRAS_SEGUNDOS = 15
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
            cache = json.load(f)
        if not isinstance(cache, dict) or not isinstance(cache.get("regras"), list):
            return None
        return cache if all(isinstance(r, dict) for r in cache["regras"]) else None
    except (ValueError, OSError):
        return None


def _cache_existe_com_regras():
    if not _cache_existe():
        return False
    cache = _ler_cache()
    return cache is not None and "regras" in cache


def _salvar_cache(regras, versao=None):
    os.makedirs(os.path.dirname(CACHE_PATH), exist_ok=True)
    temporario = CACHE_PATH.with_suffix(".tmp")
    with open(temporario, "w", encoding="utf-8") as f:
        json.dump({
            "timestamp": datetime.now().isoformat(),
            "versao": versao,
            "regras": regras
        }, f, indent=2)
    os.replace(temporario, CACHE_PATH)


def _buscar_configuracoes():
    response = client.get(
        f"/regras/{client.CLIENTE_ID}",
        addToHeaders={"x-licenca-token": client.LICENSE_TOKEN},
        timeout=TIMEOUT_REGRAS_SEGUNDOS,
    )
    regras = response.json()
    if not isinstance(regras, list) or not all(isinstance(r, dict) for r in regras):
        raise RuntimeError("Resposta de regras inválida")
    return regras


def _buscar_versao():
    response = client.get(
        f"/regras/{client.CLIENTE_ID}/versao",
        addToHeaders={"x-licenca-token": client.LICENSE_TOKEN},
        timeout=TIMEOUT_REGRAS_SEGUNDOS,
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
    if versao is None:
        try:
            versao = _buscar_versao()
        except RuntimeError:
            versao = None
    # Versão antes dos dados: uma edição entre as requisições será vista no próximo poll.
    regras = _buscar_configuracoes()
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
    if _ultimo_sync_forcado_em and agora - _ultimo_sync_forcado_em < INTERVALO_SYNC_FORCADO_SEGUNDOS:
        return None
    _ultimo_sync_forcado_em = agora

    antigas = _regras_cache_brutas()
    try:
        regras = _buscar_e_salvar()
    except RuntimeError:
        print("[configuracao] Sync forçado falhou — mantendo regras atuais")
        return None

    if antigas is not None and _regras_iguais(antigas, regras):
        return None
    print("[configuracao] Sync forçado — regras atualizadas da API")
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
    """Boot consulta a API antes de varrer arquivos; cache só é fallback offline."""
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
