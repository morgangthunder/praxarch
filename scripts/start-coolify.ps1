# Wake the Coolify WSL2 distro and wait until http://127.0.0.1:8000 responds FROM WINDOWS.
# Usage: .\scripts\start-coolify.ps1

$Distro = "Ubuntu-24.04"
$HealthUrl = "http://127.0.0.1:8000/api/health"
$OpenUrl = "http://127.0.0.1:8000/register"
$MaxWaitSec = 180
$WakeScript = Join-Path $PSScriptRoot "coolify-wake.sh"
$KeepAliveScript = Join-Path $PSScriptRoot "keep-coolify-wsl-alive.ps1"

Write-Host "Starting Coolify distro ($Distro)..." -ForegroundColor Cyan

$wslPath = (wsl -d $Distro -u root -e wslpath -a $WakeScript 2>$null).Trim()
if (-not $wslPath) {
  Write-Host "Could not resolve wake script path in WSL." -ForegroundColor Red
  exit 1
}

wsl -d $Distro -u root -e sed -i 's/\r$//' $wslPath | Out-Null

$wake = wsl -d $Distro -u root -e bash $wslPath 2>&1
$wake | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }

Write-Host "Waiting for $HealthUrl from Windows (up to ${MaxWaitSec}s)..." -ForegroundColor Cyan
$deadline = (Get-Date).AddSeconds($MaxWaitSec)
$attempt = 0
while ((Get-Date) -lt $deadline) {
  $attempt++
  try {
    $res = Invoke-WebRequest -Uri $HealthUrl -TimeoutSec 5 -UseBasicParsing
    if ($res.StatusCode -eq 200) {
      & $KeepAliveScript
      Write-Host "Coolify ready (Windows confirmed, try $attempt)" -ForegroundColor Green
      Write-Host "Open in browser NOW: $OpenUrl" -ForegroundColor Yellow
      Write-Host "Keep this PowerShell window open or leave keepalive running." -ForegroundColor DarkGray
      exit 0
    }
  } catch {
    Write-Host "  waiting from Windows... ($attempt)" -ForegroundColor DarkGray
    Start-Sleep -Seconds 5
  }
}

Write-Host "Coolify did not become reachable from Windows within ${MaxWaitSec}s." -ForegroundColor Red
Write-Host "Diagnostics:" -ForegroundColor Yellow
Write-Host "  wsl -l -v                    # Ubuntu-24.04 must be Running"
Write-Host "  wsl -d Ubuntu-24.04 -u root -e docker ps -a"
Write-Host "  netstat -ano | findstr :8000"
Write-Host ""
Write-Host "If Ubuntu-24.04 shows Stopped: run keep-coolify-wsl-alive.ps1 after start succeeds."
Write-Host "If .wslconfig changed: wsl --shutdown, restart Docker Desktop, try again."
exit 1
