$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot -Parent
$backup=Get-Content -LiteralPath (Join-Path $taskRoot '.codex/qwen-cutover.json') -Raw | ConvertFrom-Json
if($backup.phase -ne 'held'){throw 'Hold and drain generation with qwen-cutover.mjs before restarting Ollama.'}
$settings=@{OLLAMA_NUM_PARALLEL='1';OLLAMA_MAX_LOADED_MODELS='1';OLLAMA_MAX_QUEUE='4';OLLAMA_CONTEXT_LENGTH='4096';OLLAMA_KEEP_ALIVE='30s';OLLAMA_NO_CLOUD='1';OLLAMA_VULKAN='0'}
foreach($entry in $settings.GetEnumerator()){[Environment]::SetEnvironmentVariable($entry.Key,$entry.Value,'Process')}
$listener=Get-NetTCPConnection -State Listen -LocalPort 11434 -ErrorAction SilentlyContinue | Select-Object -First 1
if($listener){$processInfo=Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)";if($processInfo.Name -ne 'ollama.exe'){throw 'Port 11434 belongs to another program.'};Stop-Process -Id $listener.OwningProcess}
$executable=(Get-Command ollama.exe).Source
$runner=Start-Process -FilePath $executable -ArgumentList 'serve' -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskRoot '.codex/logs/ollama-safe.stdout.log') -RedirectStandardError (Join-Path $taskRoot '.codex/logs/ollama-safe.stderr.log') -PassThru
try{$runner.PriorityClass='BelowNormal'}catch{}
Write-Output 'Started local-only Ollama with one model, one request and bounded context.'
