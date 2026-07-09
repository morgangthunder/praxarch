#!/bin/bash
# Set Coolify instance URL for local WSL2 (port 8000). Run inside Ubuntu-24.04 as root.
set -euo pipefail

ENV_FILE=/data/coolify/source/.env
URL=http://127.0.0.1:8000

touch "$ENV_FILE"
if grep -q '^APP_URL=' "$ENV_FILE"; then
  sed -i "s|^APP_URL=.*|APP_URL=${URL}|" "$ENV_FILE"
else
  echo "APP_URL=${URL}" >> "$ENV_FILE"
fi

if ! grep -q '^APP_PORT=' "$ENV_FILE"; then
  echo "APP_PORT=8000" >> "$ENV_FILE"
fi

docker exec coolify-db psql -U coolify -d coolify -c \
  "UPDATE instance_settings SET fqdn = '${URL}' WHERE id = 0;"

docker restart coolify
sleep 15
docker exec coolify php artisan config:clear 2>/dev/null || true
docker exec coolify php artisan cache:clear 2>/dev/null || true

for i in $(seq 1 36); do
  code=$(curl -fsS --max-time 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/api/health 2>/dev/null || echo "000")
  if [ "$code" = "200" ]; then
    app_url=$(docker exec coolify php artisan tinker --execute="echo config('app.url');" 2>/dev/null | tr -d '\r')
    fqdn=$(docker exec coolify-db psql -U coolify -d coolify -t -c "SELECT fqdn FROM instance_settings WHERE id=0;" | tr -d ' \r')
    echo "healthy app.url=${app_url} fqdn=${fqdn}"
    exit 0
  fi
  sleep 5
done

echo "health timeout"
exit 1
