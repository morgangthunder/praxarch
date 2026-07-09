# Open Coolify in the default browser at the URL that works on WSL2.
# Usage: .\scripts\open-coolify.ps1

& (Join-Path $PSScriptRoot "start-coolify.ps1")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Start-Process "http://127.0.0.1:8000/register"
