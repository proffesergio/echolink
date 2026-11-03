$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$taskRoot = (Get-Location).Path
$tunnelExe = Join-Path $taskRoot '.codex/tools/cloudflared.exe'
if (!(Test-Path -LiteralPath $tunnelExe)) { throw 'Install cloudflared.exe at .codex/tools/cloudflared.exe first; see docs/CI_CD.md.' }
New-Item -ItemType Directory -Force -Path '.codex/logs' | Out-Null
if (Test-Path '.codex/logs/tunnel.pid') {
    $tunnelPid = [int](Get-Content '.codex/logs/tunnel.pid')
    $tunnelInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$tunnelPid"
    if ($tunnelInfo -and $tunnelInfo.ExecutablePath -eq $tunnelExe -and $tunnelInfo.CommandLine -match '127\.0\.0\.1:8788') {
        Stop-Process -Id $tunnelPid -Force
    }
}
$tunnelProcess = Start-Process -FilePath $tunnelExe -ArgumentList 'tunnel --url http://127.0.0.1:8788 --no-autoupdate' -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput "$taskRoot/.codex/logs/tunnel.stdout.log" -RedirectStandardError "$taskRoot/.codex/logs/tunnel.stderr.log" -PassThru
$tunnelProcess.Id | Set-Content '.codex/logs/tunnel.pid'
for ($attempt = 0; $attempt -lt 60; $attempt++) {
    Start-Sleep -Milliseconds 500
    $tunnelProcess.Refresh()
    if ($tunnelProcess.HasExited) { throw 'Tunnel exited. Check tunnel.stderr.log.' }
    if ((Get-Content '.codex/logs/tunnel.stderr.log' -Raw) -match 'https://[a-z0-9-]+\.trycloudflare\.com') {
        node scripts/read-tunnel.mjs
        if ($LASTEXITCODE -ne 0) { throw 'Could not save tunnel address' }
        exit 0
    }
}
throw 'Tunnel startup timed out. Check tunnel.stderr.log.'
