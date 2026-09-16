"""Log persistente do worker quando não há console visível (BUG-ORG-08 / #486).

O launcher sobe com -H windowsgui e o worker com CREATE_NO_WINDOW — prints
somem. Espelhamos stdout/stderr em %APPDATA%\\Efficience\\worker.log (mesmo
diretório do launcher.log) para diagnóstico remoto.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path


class _TeeTexto:
    """Escreve no stream original e no arquivo de log."""

    def __init__(self, original, arquivo):
        self._original = original
        self._arquivo = arquivo

    def write(self, data):
        if data is None:
            return 0
        texto = data if isinstance(data, str) else str(data)
        escritos = 0
        if self._original is not None:
            try:
                escritos = self._original.write(texto) or len(texto)
            except Exception:
                escritos = len(texto)
        try:
            self._arquivo.write(texto)
            self._arquivo.flush()
        except Exception:
            pass
        return escritos

    def flush(self):
        if self._original is not None:
            try:
                self._original.flush()
            except Exception:
                pass
        try:
            self._arquivo.flush()
        except Exception:
            pass

    def isatty(self):
        original = self._original
        if original is None:
            return False
        try:
            return bool(original.isatty())
        except Exception:
            return False

    def reconfigure(self, *args, **kwargs):
        original = self._original
        reconfigure = getattr(original, "reconfigure", None)
        if callable(reconfigure):
            return reconfigure(*args, **kwargs)
        return None

    @property
    def encoding(self):
        original = self._original
        return getattr(original, "encoding", None) or "utf-8"

    def __getattr__(self, name):
        return getattr(self._original, name)


def _diretorio_log() -> Path:
    appdata = os.environ.get("APPDATA")
    if appdata:
        return Path(appdata) / "Efficience"
    return Path.home() / ".config" / "efficience"


def caminho_log_worker() -> Path:
    return _diretorio_log() / "worker.log"


def iniciar_log_arquivo(caminho: Path | None = None) -> Path | None:
    """Espelha stdout/stderr no arquivo de log. Retorna o path ou None se falhar."""
    destino = Path(caminho) if caminho is not None else caminho_log_worker()
    try:
        destino.parent.mkdir(parents=True, exist_ok=True)
        arquivo = open(destino, "a", encoding="utf-8", errors="replace", buffering=1)
    except OSError as e:
        try:
            print(f"[log_arquivo] Não foi possível abrir {destino}: {e}", file=sys.stderr)
        except Exception:
            pass
        return None

    sys.stdout = _TeeTexto(sys.stdout, arquivo)
    sys.stderr = _TeeTexto(sys.stderr, arquivo)
    return destino
