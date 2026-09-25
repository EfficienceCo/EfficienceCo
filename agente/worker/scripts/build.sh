# Gera o executável do worker com PyInstaller (Windows/Linux).
# Os artefatos do classificador NÃO entram no .exe — vão na pasta
# modelos/classificador_documentos/ do pacote (ver empacotar.ps1 / #509).

set -euo pipefail
cd "$(dirname "$0")/.."
pyinstaller --onefile --noconsole main.py --name efficience-agente
