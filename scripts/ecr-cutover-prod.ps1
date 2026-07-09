# Prod ECR v2 bridge cutover — PowerShell orchestrates Coolify key + SSH.
param([string]$EcrTag = "v2")

$ErrorActionPreference = "Stop"
$ECR = "435214896413.dkr.ecr.eu-west-1.amazonaws.com/bubblbook/prod"
$REGION = "eu-west-1"
$PROD_IP = "34.251.139.131"
$ROOT = "/data/coolify/applications/nf6adysipbutbwzslufhhoqg"
$SERVER_UUID = "ray76gl90ckl5iur3fk2zgvt"

$token = (docker exec praxarch-api printenv COOLIFY_API_TOKEN).Trim()
$base = "http://127.0.0.1:8000"
$headers = @{ Authorization = "Bearer $token" }

Write-Host "Fetching SSH key..." -ForegroundColor Cyan
$srv = Invoke-RestMethod -Uri "$base/api/v1/servers/$SERVER_UUID" -Headers $headers -TimeoutSec 60
$keys = Invoke-RestMethod -Uri "$base/api/v1/security/keys" -Headers $headers -TimeoutSec 60
$kid = if ($srv.private_key_uuid) { $srv.private_key_uuid } else { $srv.private_key_id }
$pk = ($keys | Where-Object { $_.uuid -eq $kid -or $_.id -eq $kid }).private_key
if (-not $pk) { throw "SSH key not found" }

$keyFile = Join-Path $env:TEMP "prod-cutover-$(Get-Random).key"
[System.IO.File]::WriteAllText($keyFile, $pk)
icacls $keyFile /inheritance:r /grant:r "$($env:USERNAME):(R)" | Out-Null

function Invoke-ProdSsh([string]$Cmd, [int]$TimeoutSec = 600) {
  & ssh -i $keyFile -o BatchMode=yes -o StrictHostKeyChecking=accept-new `
    -o UserKnownHostsFile=NUL -o ConnectTimeout=30 -o ServerAliveInterval=30 `
    "ubuntu@$PROD_IP" "bash -lc '$($Cmd.Replace("'", "'\''"))'"
}

Write-Host "ECR login on prod..." -ForegroundColor Cyan
$ecrPass = (aws ecr get-login-password --region $REGION).Trim()
Invoke-ProdSsh "echo '$ecrPass' | sudo docker login --username AWS --password-stdin 435214896413.dkr.ecr.$REGION.amazonaws.com"

$overlay = "services:`n  app:`n    image: ${ECR}:${EcrTag}"
$overlayB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($overlay))

$bash = @"
#!/bin/bash
set -e
cd $ROOT
echo '=== bridge env ==='
for f in Back-end/.secret .env; do
  [ -f "`$f" ] || continue
  sed -i 's|^MONGO_URI=.*|MONGO_URI=mongodb://mongo:27017/bubblbook|' "`$f"
  sed -i 's|^REDIS_HOST=.*|REDIS_HOST=redis|' "`$f"
  sed -i 's|^REDIS_PORT=.*|REDIS_PORT=6379|' "`$f"
  if grep -q '^ONBOARDING_AGENT_MCP_URL=' "`$f"; then
    sed -i 's|^ONBOARDING_AGENT_MCP_URL=.*|ONBOARDING_AGENT_MCP_URL=http://mcp:3400|' "`$f"
  else
    echo 'ONBOARDING_AGENT_MCP_URL=http://mcp:3400' >> "`$f"
  fi
done
grep -E '^(MONGO_URI|REDIS_|ONBOARDING)' Back-end/.secret | sed 's/=.*$/=***/'
echo '$overlayB64' | base64 -d > docker-compose.praxarch-build.yml
sed -i 's|image:.*bubblbook/prod:.*|image: ${ECR}:${EcrTag}|' docker-compose.yml
echo '=== pull + up ==='
sudo docker pull ${ECR}:${EcrTag}
sudo docker compose -f docker-compose.yml up -d mongo redis
sudo docker compose -f docker-compose.yml -f docker-compose.praxarch-build.yml -f docker-compose.mcp.yml up -d --force-recreate app mcp
APP=`$(docker ps --format '{{.Names}}' | grep -E '^(app-|work-)' | head -1)
MCP_NET=`$(docker inspect mcp-server --format '{{range `$k,`$v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null | awk '{print `$1}')
APP_NET=`$(docker inspect "`$APP" --format '{{range `$k,`$v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null | awk '{print `$1}')
if [ -n "`$APP" ] && [ -n "`$MCP_NET" ]; then
  docker network inspect "`$MCP_NET" --format '{{range .Containers}}{{.Name}} {{end}}' | grep -q "`$APP" || docker network connect "`$MCP_NET" "`$APP" 2>/dev/null || true
fi
if [ -n "`$APP_NET" ]; then
  docker network inspect "`$APP_NET" --format '{{range .Containers}}{{.Name}} {{end}}' | grep -q mcp-server || docker network connect "`$APP_NET" mcp-server 2>/dev/null || true
fi
sleep 12
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
docker exec "`$APP" printenv MONGO_URI REDIS_HOST 2>/dev/null | sed 's|://[^@]*@|://***@|'
docker exec mongo-latest mongosh --quiet bubblbook --eval 'print("users="+db.users.countDocuments())'
curl -sf -o /dev/null -w 'root3300=%{http_code}\n' http://127.0.0.1:3300/
curl -sf -o /dev/null -w 'agree3300=%{http_code}\n' http://127.0.0.1:3300/app/g/agreeatime
curl -sk -o /dev/null -w 'https_root=%{http_code}\n' https://bubblbook.com/
curl -sk -o /dev/null -w 'https_agree=%{http_code}\n' https://bubblbook.com/app/g/agreeatime
echo CUTOVER_OK
"@
$bash = $bash -replace "`r", ""

$scriptB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($bash))
Write-Host "Running cutover..." -ForegroundColor Cyan
Invoke-ProdSsh "echo '$scriptB64' | base64 -d | bash"

Remove-Item $keyFile -Force -ErrorAction SilentlyContinue
Write-Host "Done." -ForegroundColor Green
