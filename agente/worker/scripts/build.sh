# Gera o executável do worker com PyInstaller (Windows/Linux).
# Os artefatos do classificador NÃO entram no .exe — vão na pasta
# modelos/classificador_documentos/ do pacote (ver empacotar.ps1 / #509).
#
# --hidden-import sai de deps-runtime.txt (#547 / NFE-8): processar_nfe é
# import tardio no agendador, e signxml/lxml/cryptography precisam entrar.

set -euo pipefail
cd "$(dirname "$0")/.."

hidden=()
while IFS= read -r line || [ -n "$line" ]; do
  name="${line%%#*}"
  name="${name#"${name%%[![:space:]]*}"}"
  name="${name%"${name##*[![:space:]]}"}"
  [ -z "$name" ] && continue
  hidden+=(--hidden-import "$name")
done < deps-runtime.txt

pyinstaller --onefile --noconsole main.py --name efficience-agente "${hidden[@]}"
