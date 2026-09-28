# Empacota launcher + worker + pasta de modelos do classificador.
# Uso (a partir de agente/):
#   powershell -File worker/scripts/empacotar.ps1 -SaidaDir "C:\dist\Efficience"
#
# Os binários dos artefatos (modelo.pt / *.joblib) só entram se existirem em
# -ArtefatosFonte. Sem eles o pacote ainda é válido: a gestão de paths fica
# pronta; a inferência ML fica para quando houver treino publicado (#509).

param(
    [Parameter(Mandatory = $true)]
    [string]$SaidaDir,

    [string]$LauncherExe = "",
    [string]$WorkerExe = "",
    [string]$ArtefatosFonte = "",
    [string]$ConfigExample = ""
)

$ErrorActionPreference = "Stop"

$AgenteRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$WorkerRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$LauncherRoot = Resolve-Path (Join-Path $AgenteRoot "launcher")
$ManifestSrc = Join-Path $WorkerRoot "automacoes\classificador_documentos\manifest.json"

if (-not $LauncherExe) {
    $LauncherExe = Join-Path $LauncherRoot "EfficienceLauncher.exe"
}
if (-not $WorkerExe) {
    $WorkerExe = Join-Path $WorkerRoot "dist\efficience-agente.exe"
}
if (-not $ConfigExample) {
    $ConfigExample = Join-Path $LauncherRoot "config.example.yaml"
}

New-Item -ItemType Directory -Force -Path $SaidaDir | Out-Null
$ModelosDir = Join-Path $SaidaDir "modelos\classificador_documentos"
New-Item -ItemType Directory -Force -Path $ModelosDir | Out-Null

Copy-Item -Force $ManifestSrc (Join-Path $ModelosDir "manifest.json")

if ($ArtefatosFonte -and (Test-Path $ArtefatosFonte)) {
    foreach ($nome in @("modelo.pt", "vetorizador.joblib", "indice_para_rotulo.joblib")) {
        $src = Join-Path $ArtefatosFonte $nome
        if (Test-Path $src) {
            Copy-Item -Force $src (Join-Path $ModelosDir $nome)
        }
    }
}

if (Test-Path $LauncherExe) {
    Copy-Item -Force $LauncherExe (Join-Path $SaidaDir "EfficienceLauncher.exe")
} else {
    Write-Warning "Launcher não encontrado em $LauncherExe — pasta de modelos criada mesmo assim."
}

if (Test-Path $WorkerExe) {
    Copy-Item -Force $WorkerExe (Join-Path $SaidaDir "efficience-agente.exe")
} else {
    Write-Warning "Worker exe não encontrado em $WorkerExe — continue o build PyInstaller antes do release."
}

if (Test-Path $ConfigExample) {
    Copy-Item -Force $ConfigExample (Join-Path $SaidaDir "config.example.yaml")
}

Write-Host "Pacote em: $SaidaDir"
Write-Host "Modelos:   $ModelosDir"
Get-ChildItem $ModelosDir | ForEach-Object { Write-Host ("  - " + $_.Name) }
