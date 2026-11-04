param([switch]$UseCliLogin)
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
if ($UseCliLogin) { $configureArgs += '--use-cli-login' }
& node @configureArgs
if ($LASTEXITCODE -ne 0) { throw 'Vercel settings update failed; try npm run public:repair -- -UseCliLogin after vercel login' }
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Dashboard build failed' }
Push-Location deploy/vercel
try {
    # The CLI uses the interactive login here. No credential is passed as an argument.
    & vercel.cmd deploy --prod --yes --scope omniteam1
    if ($LASTEXITCODE -ne 0) { throw 'Vercel deployment failed' }
} finally { Pop-Location }
& node scripts/check-local-services.mjs
if ($LASTEXITCODE -ne 0) { throw 'Service checks failed; see the result above' }
