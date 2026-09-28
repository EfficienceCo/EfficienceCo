"""O manifesto de imports e a unica lista. Nao importa torch/pandas."""

from pathlib import Path

from checar_deps import modulos

ROOT = Path(__file__).resolve().parent.parent
REQUIREMENTS = ROOT / "requirements.txt"

NAO_SAO_IMPORT_DE_RUNTIME = {"pyinstaller", "pytest"}
IMPORT_DO_PACOTE = {"Pillow": "PIL", "python-dotenv": "dotenv"}


def _pacotes_requirements():
    pacotes = []
    for linha in REQUIREMENTS.read_text(encoding="utf-8").splitlines():
        linha = linha.split("#", 1)[0].strip()
        if not linha:
            continue
        nome = linha.split("[", 1)[0]
        for separador in ("===", "==", ">=", "<=", "~=", ">", "<", "!="):
            nome = nome.split(separador, 1)[0]
        pacotes.append(nome.strip())
    return pacotes


def test_requirements_de_runtime_estao_no_manifesto():
    nomes = set(modulos())
    faltando = []
    for pacote in _pacotes_requirements():
        if pacote in NAO_SAO_IMPORT_DE_RUNTIME:
            continue
        importado = IMPORT_DO_PACOTE.get(pacote, pacote)
        if importado not in nomes:
            faltando.append(f"{pacote} -> {importado}")
    assert not faltando, faltando


def test_manifesto_inclui_pytesseract_e_nao_carrega_modulo():
    assert "pytesseract" in modulos()
    assert "scikit-learn" not in modulos()
    assert "sklearn" not in modulos()
