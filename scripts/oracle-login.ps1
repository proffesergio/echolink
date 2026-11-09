param(
    [ValidatePattern('^[a-z0-9-]{3,80}$')][string]$Region,
    [ValidatePattern('^[A-Za-z0-9_.-]{1,64}$')][string]$Profile = 'EchoLink'
)
$ErrorActionPreference = 'Stop'
# OCI invokes Windows PowerShell to validate credential-file ACLs. Prefer its
# native modules when this script inherits a PowerShell 7 module search path.
$env:PSModulePath = (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\Modules') + ';' + $env:PSModulePath
$ociExecutable = Join-Path $env:LOCALAPPDATA 'Programs\EchoLink\oci-cli\Scripts\oci.exe'
if (!(Test-Path -LiteralPath $ociExecutable)) {
    $command = Get-Command oci -ErrorAction SilentlyContinue
    if (!$command) { throw 'Install Oracle CLI before signing in. See docs/ORACLE_MIGRATION.md.' }
    $ociExecutable = $command.Source
}
$ociArguments = @('session', 'authenticate', '--profile-name', $Profile)
if ($Region) { $ociArguments += @('--region', $Region) }
Write-Host 'Select your Oracle home region and finish sign-in in the browser. Credentials stay in your user .oci directory.'
& $ociExecutable @ociArguments
exit $LASTEXITCODE
