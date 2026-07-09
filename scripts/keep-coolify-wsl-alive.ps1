# Keep Ubuntu-24.04 WSL distro running (prevents port 8000 dropping when idle).
# Starts a hidden background wsl process. Safe to run multiple times.
# Usage: .\scripts\keep-coolify-wsl-alive.ps1

$Distro = "Ubuntu-24.04"
$Marker = Join-Path $env:LOCALAPPDATA "praxarch-coolify-wsl-keepalive.pid"

$existing = Get-Process -Name "wsl" -ErrorAction SilentlyContinue | Where-Object {
  try { $_.CommandLine -like "*sleep infinity*$Distro*" } catch { $false }
}
if ($existing) {
  Write-Host "WSL keepalive already running (pid $($existing.Id))." -ForegroundColor DarkGray
  exit 0
}

$proc = Start-Process -FilePath "wsl.exe" `
  -ArgumentList "-d", $Distro, "-e", "sleep", "infinity" `
  -WindowStyle Hidden -PassThru

Set-Content -Path $Marker -Value $proc.Id -Encoding ascii
Write-Host "WSL keepalive started (wsl pid $($proc.Id)) for $Distro." -ForegroundColor Green
Write-Host "Leave this running while using Coolify. Stop with: Stop-Process -Id $($proc.Id)" -ForegroundColor DarkGray
