"""Configura o path do agente para imports absolutos (core.*, automacoes.*)."""

import sys
from pathlib import Path

import pytest

RAIZ_AGENTE = Path(__file__).resolve().parent.parent
if str(RAIZ_AGENTE) not in sys.path:
    sys.path.insert(0, str(RAIZ_AGENTE))



@pytest.fixture(autouse=True)
def _isolar_pasta_base(monkeypatch):
    """PASTA_BASE vem do .env local (load_dotenv) e vazaria para os testes; cada teste define a sua."""
    monkeypatch.delenv("PASTA_BASE", raising=False)
