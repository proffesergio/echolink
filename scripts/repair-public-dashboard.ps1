$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
function Test-LocalJson([string]$Url) {
    try { $response = Invoke-WebRequest $Url -UseBasicParsing -TimeoutSec 5; return ($response.StatusCode -eq 200 -and $response.Headers['Content-Type'] -match 'application/json') } catch { return $false }
}
if (!(Test-LocalJson 'http://127.0.0.1:8787/health')) {
    & powershell -NoProfile -File scripts/restart-worker.ps1
    if ($LASTEXITCODE -ne 0) { throw 'Worker startup failed' }
}
$bridgeOnline = $false
try { $response = Invoke-WebRequest 'http://127.0.0.1:8788/admin/api/auth' -UseBasicParsing -TimeoutSec 3 } catch { $bridgeOnline = $_.Exception.Response.StatusCode.value__ -eq 401 }
if (!$bridgeOnline) {
    & powershell -NoProfile -File scripts/restart-bridge.ps1
    if ($LASTEXITCODE -ne 0) { throw 'Bridge startup failed' }
}
& powershell -NoProfile -File scripts/restart-tunnel.ps1
if ($LASTEXITCODE -ne 0) { throw 'Tunnel restart failed' }
$configureArgs = @('scripts/configure-vercel.mjs')
& node @configureArgs
if ($LASTEXITCODE -ne 0) { throw 'Vercel settings update failed; check VERCEL_TOKEN and project access' }
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Dashboard build failed' }
& node scripts/deploy-dashboard.mjs
if ($LASTEXITCODE -ne 0) { throw 'Vercel deployment failed' }
& node scripts/check-local-services.mjs
if ($LASTEXITCODE -ne 0) { throw 'Service checks failed; see the result above' }
