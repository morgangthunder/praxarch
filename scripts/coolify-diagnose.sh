#!/bin/bash
set -euo pipefail

echo "=== wsl docker ps ==="
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

echo "=== health ==="
curl -fsS -o /dev/null -w 'inside-health:%{http_code}\n' http://127.0.0.1:8000/api/health || echo inside-health:fail

echo "=== instance_settings ==="
docker exec coolify-db psql -U coolify -d coolify -c "SELECT id, fqdn, public_ipv4 FROM instance_settings;"

echo "=== laravel app.url ==="
docker exec coolify php artisan tinker --execute="echo config('app.url');" 2>/dev/null | tr -d '\r'

echo "=== .env APP_URL ==="
grep '^APP_URL=' /data/coolify/source/.env || echo 'APP_URL not in host .env'

echo "=== register page links (localhost without port) ==="
curl -fsS http://127.0.0.1:8000/register 2>/dev/null | grep -oE 'https?://localhost[^"<> ]*' | sort -u | head -20 || true

echo "=== register POST redirect test ==="
curl -fsS -D - -o /dev/null http://127.0.0.1:8000/register 2>&1 | grep -iE '^(HTTP|Location|Set-Cookie)' | head -10
