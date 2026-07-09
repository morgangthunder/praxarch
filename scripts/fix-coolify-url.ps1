# Fix Coolify redirect URL for local WSL2 (Register was sending you to http://localhost without :8000).
# Usage: .\scripts\fix-coolify-url.ps1

$Distro = "Ubuntu-24.04"
$Script = Join-Path $PSScriptRoot "fix-coolify-url.sh"
$wslPath = (wsl -d $Distro -u root -e wslpath -a $Script 2>$null).Trim()

if (-not $wslPath) {
  Write-Host "Could not resolve script path in WSL." -ForegroundColor Red
  exit 1
}

Write-Host "Setting Coolify APP_URL to http://127.0.0.1:8000 ..." -ForegroundColor Cyan
wsl -d $Distro -u root -e sed -i 's/\r$//' $wslPath | Out-Null
wsl -d $Distro -u root -e bash $wslPath
if ($LASTEXITCODE -eq 0) {
  Write-Host "Done. Open http://127.0.0.1:8000/register and try again." -ForegroundColor Green
} else {
  Write-Host "Fix failed - run .\scripts\start-coolify.ps1 first." -ForegroundColor Red
  exit 1
}
