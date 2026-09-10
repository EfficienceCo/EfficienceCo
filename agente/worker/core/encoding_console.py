"""Garante stdout/stderr UTF-8 no agente (Windows cp1252 / console oculto).

BUG-NFE-01: prints com caracteres fora de cp1252 (ex.: U+2192) levantam
UnicodeEncodeError e caem em excepts genéricos como se a operação tivesse falhado.
"""

from __future__ import annotations

import sys


def garantir_stdout_utf8() -> None:
    """Reconfigura stdout/stderr para UTF-8 com errors=replace.

    No-op se o stream não expõe reconfigure (ex.: StringIO em testes) ou se
    a troca de encoding for recusada pelo runtime.
    """
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if not callable(reconfigure):
            continue
        try:
            reconfigure(encoding="utf-8", errors="replace")
        except (OSError, ValueError, AttributeError):
            continue
