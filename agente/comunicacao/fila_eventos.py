import json
import os
import threading
from datetime import datetime
from pathlib import Path

FILA_PATH = os.getenv("PASTA_FILA", str(Path.home() / ".config" / "efficience" / "fila_eventos.json"))
INTERVALO_RETRY_MINUTOS = 30

_lock = threading.Lock()

def _ler_fila():
    try:
        with open(FILA_PATH, "r") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []

def _salvar_fila(fila):
    os.makedirs(os.path.dirname(FILA_PATH), exist_ok=True)
    with open(FILA_PATH, "w") as f:
        json.dump(fila, f, indent=2)

def enfileirar_evento(descricao, sucesso):
    with _lock:
        fila = _ler_fila()
        fila.append({
            "descricao": descricao,
            "sucesso": sucesso,
            "timestamp_original": datetime.now().isoformat()
        })
        _salvar_fila(fila)
        print(f"[fila] Evento salvo na fila ({len(fila)} pendente(s))")

def reenviar_fila():
    import comunicacao.api_client as client

    with _lock:
        fila = _ler_fila()
        if not fila:
            return

    print(f"[fila] Tentando reenviar {len(fila)} evento(s)...")
    pendentes = []

    for evento in fila:
        try:
            client.post(
                "/eventos",
                {
                    "cliente_id": client.CLIENTE_ID,
                    "descricao": evento["descricao"],
                    "sucesso": evento["sucesso"]
                },
                addToHeaders={"x-licenca-token": client.LICENSE_TOKEN}
            )
        except Exception:
            pendentes.append(evento)

    with _lock:
        novos = _ler_fila()
        _salvar_fila(pendentes + novos)  # ← junta pendentes com eventos que chegaram durante o reenvio

    reenviados = len(fila) - len(pendentes)
    if reenviados:
        print(f"[fila] {reenviados} evento(s) reenviado(s), {len(pendentes + novos)} ainda pendente(s)")
