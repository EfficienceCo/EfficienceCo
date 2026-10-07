@echo off
REM Wrapper de desenvolvimento: launcher sobe o worker via Python (sem PyInstaller).
REM Em producao use efficience-agente.exe gerado pelo build do worker.
REM
REM Confere os imports de deps-runtime.txt com find_spec, sem carregar torch.
REM Se faltar algum (pdfplumber, pytesseract, pandas, ...), instala requirements.txt.
REM Nao instala scikit-learn/joblib — fora do runtime (#513 / #639; path = ResNet).

cd /d "%~dp0..\worker"

py -3 checar_deps.py
if errorlevel 1 (
  echo [run-worker-dev] Dependencias ausentes - instalando requirements.txt ...
  py -3 -m pip install -r requirements.txt
  if errorlevel 1 (
    echo [run-worker-dev] FALHA ao instalar deps. Rode: py -3 -m pip install -r requirements.txt
    exit /b 1
  )
)

py -3 main.py
