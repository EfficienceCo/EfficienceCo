"""Configura o path do agente para imports absolutos (core.*, automacoes.*)."""

import sys
from pathlib import Path

import pytest

RAIZ_AGENTE = Path(__file__).resolve().parent.parent
TESTES = Path(__file__).resolve().parent
for caminho in (RAIZ_AGENTE, TESTES):
    if str(caminho) not in sys.path:
        sys.path.insert(0, str(caminho))



@pytest.fixture(autouse=True)
def _isolar_pasta_base(monkeypatch):
    """PASTA_BASE vem do .env local (load_dotenv) e vazaria para os testes; cada teste define a sua."""
    monkeypatch.delenv("PASTA_BASE", raising=False)
