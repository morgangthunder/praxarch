# Register Windows Scheduled Tasks so the Coolify WSL distro stays up.
# Run once: .\scripts\install-coolify-autostart.ps1

$RepoRoot = Split-Path $PSScriptRoot -Parent
$StartScript = Join-Path $RepoRoot "scripts\start-coolify.ps1"
$KeepAliveScript = Join-Path $RepoRoot "scripts\keep-coolify-wsl-alive.ps1"
$TaskNameBoot = "Praxarch-Coolify-OnLogon"
$TaskNameKeep = "Praxarch-Coolify-Keepalive"
$TaskNameWsl = "Praxarch-Coolify-WslKeepalive"

if (-not (Test-Path $StartScript)) {
  Write-Error "Missing $StartScript"
  exit 1
}

$bootAction = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$StartScript`""

$bootTrigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

Register-ScheduledTask `
  -TaskName $TaskNameBoot `
  -Action $bootAction `
  -Trigger $bootTrigger `
  -Description "Start Coolify WSL2 distro (Ubuntu-24.04) when you sign in to Windows" `
  -Force | Out-Null

$wslKeepAction = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$KeepAliveScript`""

Register-ScheduledTask `
  -TaskName $TaskNameWsl `
  -Action $wslKeepAction `
  -Trigger $bootTrigger `
  -Description "Keep Ubuntu-24.04 WSL distro running (sleep infinity)" `
  -Force | Out-Null

$keepAction = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$StartScript`""

$keepTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 2) -RepetitionDuration (New-TimeSpan -Days 3650)

Register-ScheduledTask `
  -TaskName $TaskNameKeep `
  -Action $keepAction `
  -Trigger $keepTrigger `
  -Description "Keep Coolify WSL2 distro alive (every 2 min)" `
  -Force | Out-Null

Write-Host "Registered:" -ForegroundColor Green
Write-Host "  - $TaskNameBoot (start Coolify at logon)"
Write-Host "  - $TaskNameWsl (keep WSL distro alive at logon)"
Write-Host "  - $TaskNameKeep (health check every 2 minutes)"
Write-Host ""
Write-Host "Ensure %USERPROFILE%\.wslconfig has vmIdleTimeout=-1, then run: wsl --shutdown"
