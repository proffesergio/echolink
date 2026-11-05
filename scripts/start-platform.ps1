$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$taskRoot = (Get-Location).Path
New-Item -ItemType Directory -Force -Path '.codex/logs' | Out-Null
# Stop only the creator worker and bridge. n8n and Ollama retain their own lifecycles.
if (Test-Path '.codex/logs/platform-supervisor.pid') {
    $supervisorPid = [int](Get-Content '.codex/logs/platform-supervisor.pid')
    $info = Get-CimInstance Win32_Process -Filter "ProcessId=$supervisorPid"
    if ($info.Name -eq 'node.exe' -and $info.CommandLine -match 'platform-supervisor\.mjs') { Stop-Process -Id $supervisorPid -Force }
}
$listeners = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in 8790,8788 }
foreach ($listener in $listeners) {
    $info = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
    if ($info.Name -eq 'node.exe' -and $info.CommandLine -match '(server[/\\]index\.mjs|src[/\\]bridge\.mjs)') { Stop-Process -Id $info.ProcessId -Force }
}
$supervisor = Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList 'scripts/platform-supervisor.mjs' -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput "$taskRoot/.codex/logs/platform-supervisor.stdout.log" -RedirectStandardError "$taskRoot/.codex/logs/platform-supervisor.stderr.log" -PassThru
$supervisor.Id | Set-Content '.codex/logs/platform-supervisor.pid'
Write-Output "Creator worker supervisor started (PID $($supervisor.Id))."
