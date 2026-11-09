param(
    [ValidatePattern('^[a-z0-9-]{3,80}$')][string]$Region,
    [ValidatePattern('^[A-Za-z0-9_.-]{1,64}$')][string]$Profile = 'EchoLink',
    [switch]$InspectTarget
)
$ErrorActionPreference = 'Stop'
$env:PSModulePath = (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\Modules') + ';' + $env:PSModulePath
$ociExecutable = Join-Path $env:LOCALAPPDATA 'Programs\EchoLink\oci-cli\Scripts\oci.exe'
if (!(Test-Path -LiteralPath $ociExecutable)) {
    $command = Get-Command oci -ErrorAction SilentlyContinue
    if (!$command) { throw 'Oracle CLI is not installed. See docs/ORACLE_MIGRATION.md.' }
    $ociExecutable = $command.Source
}
$version = (& $ociExecutable --version | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Oracle CLI could not start.' }
$configFile = if ($env:OCI_CLI_CONFIG_FILE) { $env:OCI_CLI_CONFIG_FILE } else { Join-Path $env:USERPROFILE '.oci\config' }
$profileSettings = @{}
$currentProfile = ''
if (Test-Path -LiteralPath $configFile) {
    foreach ($line in Get-Content -LiteralPath $configFile) {
        if ($line -match '^\s*\[([^\]]+)\]\s*$') { $currentProfile = $Matches[1]; continue }
        if ($currentProfile -eq $Profile -and $line -match '^\s*([a-z_]+)\s*=\s*(.*?)\s*$') { $profileSettings[$Matches[1]] = $Matches[2] }
    }
}
if (!$Region -and $profileSettings['region']) { $Region = $profileSettings['region'] }
if (!$profileSettings['tenancy'] -or !$Region) {
    [pscustomobject]@{ CliVersion = $version; Profile = $Profile; Status = 'Authentication required'; ReadOnly = $true; NextCommand = 'npm run oracle:login' } | ConvertTo-Json
    exit 2
}
if ($Region -notmatch '^[a-z0-9-]{3,80}$') { throw 'The configured region is invalid.' }
$auth = if ($profileSettings['security_token_file']) { 'security_token' } else { 'api_key' }
$ociArguments = @('iam', 'region-subscription', 'list', '--tenancy-id', $profileSettings['tenancy'], '--region', $Region, '--profile', $Profile, '--config-file', $configFile, '--auth', $auth, '--output', 'json')
$previousPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$response = & $ociExecutable @ociArguments 2>$null
$resultCode = $LASTEXITCODE
$ErrorActionPreference = $previousPreference
if ($resultCode -ne 0) { throw 'Oracle account verification failed. Run npm run oracle:login to refresh the session, or check the profile permissions.' }
$subscriptions = @((($response -join "`n") | ConvertFrom-Json).data)
$report = [ordered]@{
    CliVersion = $version
    Profile = $Profile
    Status = 'Authenticated; region subscriptions verified'
    Region = $Region
    ReadOnly = $true
    HomeRegion = @($subscriptions | Where-Object { $_.'is-home-region' } | ForEach-Object { $_.'region-name' })
    SubscribedRegions = @($subscriptions | ForEach-Object { $_.'region-name' })
    NextStep = 'Inspect compartments, existing compute, A1 limits and storage before provisioning.'
}
if ($InspectTarget) {
    $targetFile = Join-Path (Split-Path $PSScriptRoot -Parent) '.codex\cloud\oracle\target.json'
    if (!(Test-Path -LiteralPath $targetFile)) { throw 'No local migration target has been selected.' }
    $target = Get-Content -LiteralPath $targetFile -Raw | ConvertFrom-Json
    if ($target.instanceId -notmatch '^ocid1\.instance\.[A-Za-z0-9._-]+$' -or $target.region -notmatch '^[a-z0-9-]{3,80}$') { throw 'Invalid local Oracle target metadata.' }
    $common = @('--region', $target.region, '--profile', $Profile, '--config-file', $configFile, '--auth', $auth, '--output', 'json')
    $instanceText = & $ociExecutable compute instance get --instance-id $target.instanceId @common
    if ($LASTEXITCODE -ne 0) { throw 'The existing instance could not be inspected. No resource was changed.' }
    $instance = (($instanceText -join "`n") | ConvertFrom-Json).data
    $vnics = @()
    if ($instance.'lifecycle-state' -ne 'TERMINATED') {
        $vnicText = & $ociExecutable compute instance list-vnics --instance-id $target.instanceId @common
        if ($LASTEXITCODE -ne 0) { throw 'Instance network inspection failed. No resource was changed.' }
        $vnics = @((($vnicText -join "`n") | ConvertFrom-Json).data | Where-Object { $null -ne $_ -and $_.id })
    }
    $report['ExistingInstance'] = [ordered]@{
        Name = $instance.'display-name'
        State = $instance.'lifecycle-state'
        Region = $target.region
        InHomeRegion = @($subscriptions | Where-Object { $_.'is-home-region' -and $_.'region-name' -eq $target.region }).Count -gt 0
        Shape = $instance.shape
        MemoryGB = $instance.'shape-config'.'memory-in-gbs'
        PublicIpAssigned = @($vnics | Where-Object { $_.'public-ip' }).Count -gt 0
        NetworkInterfaces = $vnics.Count
    }
}
[pscustomobject]$report | ConvertTo-Json -Depth 5
