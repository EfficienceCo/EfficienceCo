@echo off
REM Wrapper de desenvolvimento: launcher sobe o worker via Python (sem PyInstaller).
REM Em producao use efficience-agente.exe gerado pelo build do worker.
REM
REM Garante deps de requirements.txt antes de subir (BUG-AGENTE-DEPS-01 / #515) —
REM pdfplumber/pandas/openpyxl listados mas ausentes quebravam OCR e Excel no QA.

cd /d "%~dp0..\worker"

py -3 -c "import pdfplumber,pandas,openpyxl,pypdfium2,PIL,torch,torchvision,matplotlib,docxtpl,requests,watchdog,schedule,dotenv" 2>nul
if errorlevel 1 (
  echo [run-worker-dev] Dependencias ausentes — instalando requirements.txt …
  py -3 -m pip install -r requirements.txt
  if errorlevel 1 (
    echo [run-worker-dev] FALHA ao instalar deps. Rode: py -3 -m pip install -r requirements.txt
    exit /b 1
  )
)

py -3 main.py
