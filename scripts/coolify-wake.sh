#!/bin/bash
# Run inside Ubuntu-24.04: repair docker if needed, start Coolify stack, wait for health.
set -euo pipefail

COOLIFY_DIR=/data/coolify/source

wait_for_docker() {
  local i
  for i in $(seq 1 60); do
    if systemctl is-active docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

repair_docker() {
  # is-active exits non-zero for activating/failed — capture stdout only.
  local state
  state=$(systemctl show -p ActiveState --value docker 2>/dev/null || echo inactive)

  if [ "$state" = "active" ]; then
    docker info >/dev/null 2>&1 && return 0
  fi

  if [ "$state" = "activating" ]; then
    echo "docker activating, waiting..."
    wait_for_docker && return 0
  fi

  echo "repairing docker (state=$state)..."
  systemctl stop docker 2>/dev/null || true
  sleep 2
  pkill -9 dockerd 2>/dev/null || true
  rm -f /var/run/docker.pid
  systemctl reset-failed docker 2>/dev/null || true
  systemctl start docker

  if ! wait_for_docker; then
    echo "docker failed to become active"
    systemctl status docker --no-pager -l | head -20
    return 1
  fi
}

repair_docker

if [ -f "$COOLIFY_DIR/docker-compose.yml" ]; then
  docker compose -f "$COOLIFY_DIR/docker-compose.yml" -f "$COOLIFY_DIR/docker-compose.prod.yml" --env-file "$COOLIFY_DIR/.env" up -d
else
  docker start coolify-db coolify-redis coolify-realtime coolify 2>/dev/null || true
fi

for i in $(seq 1 36); do
  code=$(curl -fsS --max-time 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/api/health 2>/dev/null || echo "000")
  if [ "$code" = "200" ]; then
    echo "healthy"
    exit 0
  fi
  echo "wait $i ($code)"
  sleep 5
done

echo "timeout"
docker ps -a
systemctl status docker --no-pager -l | head -15
exit 1
