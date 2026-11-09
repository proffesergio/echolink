$ErrorActionPreference = 'Stop'
$taskRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$nodeBinary = (Get-Command node.exe).Source
$backupScript = Join-Path $taskRoot 'scripts\nightly-backup.mjs'
$taskAction = New-ScheduledTaskAction -Execute $nodeBinary -Argument ('"' + $backupScript + '"') -WorkingDirectory $taskRoot
$taskTrigger = New-ScheduledTaskTrigger -Daily -At '03:30'
$taskPrincipal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$taskSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 1)
Register-ScheduledTask -TaskName 'EchoLink-Daily-Backup' -Action $taskAction -Trigger $taskTrigger -Principal $taskPrincipal -Settings $taskSettings -Description 'Local PostgreSQL dump, verified Aiven snapshot and encrypted recovery materials. Runs while the operator is signed in.' -Force | Out-Null
Write-Output 'EchoLink daily backup scheduled for 03:30 in the Windows timezone; missed runs start when available.'
