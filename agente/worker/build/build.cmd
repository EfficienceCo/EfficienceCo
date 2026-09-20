@echo off
REM Build Windows do worker (espelha build.sh) — BUG-AGENTE-DEPS-01 / #515.
setlocal
cd /d "%~dp0.."

echo [build] instalando deps de requirements.txt …
py -3 -m pip install -r requirements.txt
if errorlevel 1 exit /b 1

echo [build] empacotando efficience-agente …
py -3 -m PyInstaller --onefile --noconsole main.py --name efficience-agente --clean ^
  --hidden-import=pdfplumber ^
  --hidden-import=pytesseract ^
  --hidden-import=pypdfium2 ^
  --hidden-import=PIL ^
  --hidden-import=pandas ^
  --hidden-import=openpyxl ^
  --hidden-import=matplotlib ^
  --hidden-import=torch ^
  --hidden-import=torchvision ^
  --hidden-import=docxtpl ^
  --hidden-import=docx
if errorlevel 1 exit /b 1

echo [build] ok — veja dist\efficience-agente.exe
endlocal
