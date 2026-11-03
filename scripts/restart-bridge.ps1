$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$taskRoot = (Get-Location).Path
New-Item -ItemType Directory -Force -Path '.codex/logs' | Out-Null
if (Test-Path '.codex/logs/bridge.pid') {
    $bridgePid = [int](Get-Content '.codex/logs/bridge.pid')
    $bridgeInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$bridgePid"
    if ($bridgeInfo -and $bridgeInfo.Name -eq 'node.exe' -and $bridgeInfo.CommandLine -match 'src/bridge\.mjs') { Stop-Process -Id $bridgePid -Force }
}
$bridgeProcess = Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList 'src/bridge.mjs' -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput "$taskRoot/.codex/logs/bridge.stdout.log" -RedirectStandardError "$taskRoot/.codex/logs/bridge.stderr.log" -PassThru
$bridgeProcess.Id | Set-Content '.codex/logs/bridge.pid'
Write-Output "Protected local bridge started (PID $($bridgeProcess.Id))."
