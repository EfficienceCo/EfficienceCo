@echo off
REM Wrapper de desenvolvimento: launcher sobe o worker via Python (sem PyInstaller).
REM Em producao use efficience-agente.exe gerado pelo build do worker.
cd /d "%~dp0..\worker"
py -3 main.py
