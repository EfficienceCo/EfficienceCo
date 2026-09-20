"""Garante que as deps críticas de produção estão instaláveis/importáveis (#515)."""

from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
REQUIREMENTS = ROOT / "requirements.txt"

# Pacotes que produção importa de fato (lazy ou no boot). Sem eles o QA-A/QA-J
# registra "listado no requirements mas ausente no env".
DEPS_CRITICAS = (
    "pdfplumber",
    "pandas",
    "openpyxl",
    "pypdfium2",
    "PIL",
    "torch",
    "torchvision",
    "matplotlib",
    "docxtpl",
    "requests",
    "watchdog",
    "schedule",
    "dotenv",
)

# Scaffolding teste_rede_neural — fora de produção até #513.
DEPS_SCAFFOLDING_FORA_DE_PRODUCAO = ("sklearn", "scikit-learn", "joblib")


def _texto_requirements():
    return REQUIREMENTS.read_text(encoding="utf-8").lower()


def test_requirements_lista_deps_criticas_de_producao():
    texto = _texto_requirements()
    faltando = [dep for dep in ("pdfplumber", "pandas", "openpyxl", "torch", "pypdfium2", "matplotlib", "pytesseract") if dep not in texto]
    assert not faltando, f"requirements.txt sem deps de produção: {faltando}"


def test_requirements_nao_puxa_sklearn_do_scaffolding():
    """sklearn/joblib incham o .exe e só servem ao teste_rede_neural (#513)."""
    texto = _texto_requirements()
    for dep in DEPS_SCAFFOLDING_FORA_DE_PRODUCAO:
        # Pode aparecer só em comentário explicando a exclusão.
        linhas_ativas = [ln for ln in texto.splitlines() if ln.strip() and not ln.strip().startswith("#")]
        assert not any(dep in ln for ln in linhas_ativas), (
            f"{dep} não deve estar ativo em requirements.txt de produção (ver #513)"
        )


@pytest.mark.parametrize("modulo", DEPS_CRITICAS)
def test_deps_criticas_importaveis(modulo):
    """Falha alto se o env do worker não instalou o que o requirements lista."""
    try:
        __import__(modulo)
    except ImportError as e:
        pytest.fail(
            f"Dependência de produção ausente: {modulo} ({e}). "
            "Rode: py -3 -m pip install -r agente/worker/requirements.txt"
        )
