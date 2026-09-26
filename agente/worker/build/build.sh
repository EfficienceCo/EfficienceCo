#!/bin/bash
# Gera o executável do agente com PyInstaller.
# Sempre reinstala requirements.txt antes do bundle — evita o cenário QA-A/QA-J
# em que deps listadas não estavam no Python usado no build (BUG-AGENTE-DEPS-01).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PYTHON="${PYTHON:-python3}"
if ! command -v "$PYTHON" >/dev/null 2>&1; then
  PYTHON=python
fi

echo "[build] instalando deps de $ROOT/requirements.txt …"
"$PYTHON" -m pip install -r requirements.txt

# Lazy imports (pdfplumber/pandas/…) não são detectados pelo analysis do
# PyInstaller — listar explicitamente o que produção usa em runtime.
HIDDEN=(
  --hidden-import=pdfplumber
  --hidden-import=pytesseract
  --hidden-import=pypdfium2
  --hidden-import=PIL
  --hidden-import=pandas
  --hidden-import=openpyxl
  --hidden-import=matplotlib
  --hidden-import=torch
  --hidden-import=torchvision
  --hidden-import=docxtpl
  --hidden-import=docx
)

echo "[build] empacotando efficience-agente …"
"$PYTHON" -m PyInstaller --onefile --noconsole main.py --name efficience-agente \
  --clean \
  "${HIDDEN[@]}"

echo "[build] ok — veja dist/efficience-agente"
