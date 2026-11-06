$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
uv venv --python 3.11 platform/.local/rembg-venv
if ($LASTEXITCODE -ne 0) { throw 'Python environment setup failed.' }
uv pip install --python platform/.local/rembg-venv/Scripts/python.exe 'rembg[cpu]==2.0.72'
if ($LASTEXITCODE -ne 0) { throw 'Background-removal installation failed.' }
$creativePreviousCache = $env:U2NET_HOME
try {
    $env:U2NET_HOME = Join-Path (Get-Location).Path 'platform/.local/models/rembg'
    & platform/.local/rembg-venv/Scripts/python.exe -c "from rembg import new_session; new_session('u2netp', providers=['CPUExecutionProvider']); print('Local CPU cutout model ready.')"
    if ($LASTEXITCODE -ne 0) { throw 'Model download failed.' }
} finally { $env:U2NET_HOME = $creativePreviousCache }
