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

# Lazy imports nao entram no analysis do PyInstaller. A lista e deps-runtime.txt,
# o mesmo arquivo que run-worker-dev.cmd confere antes de subir.
HIDDEN=()
while IFS= read -r nome || [[ -n "$nome" ]]; do
  nome="${nome%%$'\r'}"
  [[ -z "$nome" || "$nome" =~ ^[[:space:]]*# ]] && continue
  nome="${nome%%#*}"
  nome="${nome%"${nome##*[![:space:]]}"}"
  nome="${nome#"${nome%%[![:space:]]*}"}"
  [[ -z "$nome" ]] && continue
  HIDDEN+=("--hidden-import=${nome}")
done < deps-runtime.txt

echo "[build] empacotando efficience-agente …"
"$PYTHON" -m PyInstaller --onefile --noconsole main.py --name efficience-agente \
  --clean \
  "${HIDDEN[@]}"

echo "[build] ok — veja dist/efficience-agente"
