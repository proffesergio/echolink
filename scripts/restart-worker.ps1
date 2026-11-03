$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$taskRoot = (Get-Location).Path
New-Item -ItemType Directory -Force -Path '.codex/logs' | Out-Null
if (Test-Path '.codex/logs/worker.pid') {
    $workerPid = [int](Get-Content '.codex/logs/worker.pid')
    $workerInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$workerPid"
    if ($workerInfo -and $workerInfo.Name -eq 'node.exe' -and $workerInfo.CommandLine -match 'src/server\.mjs') {
        Stop-Process -Id $workerPid -Force
    }
}
$workerProcess = Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList 'src/server.mjs' -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput "$taskRoot/.codex/logs/worker.stdout.log" -RedirectStandardError "$taskRoot/.codex/logs/worker.stderr.log" -PassThru
$workerProcess.Id | Set-Content '.codex/logs/worker.pid'
for ($attempt = 0; $attempt -lt 20; $attempt++) {
    Start-Sleep -Milliseconds 500
    $workerProcess.Refresh()
    if ($workerProcess.HasExited) { throw 'Worker exited. Check .codex/logs/worker.stderr.log.' }
    try {
        $health = Invoke-WebRequest 'http://127.0.0.1:8787/health' -UseBasicParsing -TimeoutSec 2
        if ($health.StatusCode -eq 200) { Write-Output "EchoLink worker ready on port 8787 (PID $($workerProcess.Id))."; exit 0 }
    } catch { }
}
throw 'Worker startup timed out. Check local worker logs.'
