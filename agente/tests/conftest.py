"""Configura o path do agente para imports absolutos (core.*, automacoes.*)."""

import sys
from pathlib import Path

RAIZ_AGENTE = Path(__file__).resolve().parent.parent
if str(RAIZ_AGENTE) not in sys.path:
    sys.path.insert(0, str(RAIZ_AGENTE))
