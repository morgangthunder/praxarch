#!/usr/bin/env bash
# ── Praxarch host bootstrap ──────────────────────────────────────────
# One-time provisioning of a fresh Linux host (e.g. AWS EC2 Ubuntu 24.04)
# to run the hosted Praxarch stack (docker-compose.prod.yml).
#
# This is the BREAK-GLASS / first-boot path: it does NOT depend on a
# running Praxarch to deploy Praxarch. After this runs once, subsequent
# updates can go through the Praxarch Deployments UI (Coolify) or CI.
#
# Usage (on the target host):
#   git clone <repo> praxarch && cd praxarch
#   cp .env.production.example .env   # then edit secrets
#   sudo bash scripts/bootstrap-praxarch-host.sh
#
# Idempotent: safe to re-run. Installs Docker if missing, then brings the
# stack up. Does NOT create any AWS resources.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${REPO_DIR}/docker-compose.prod.yml"
ENV_FILE="${REPO_DIR}/.env"

log() { printf '\033[0;35m[bootstrap]\033[0m %s\n' "$*"; }
die() { printf '\033[0;31m[bootstrap] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }

# ── 1. Preconditions ────────────────────────────────────────────────
[ -f "$COMPOSE_FILE" ] || die "Missing $COMPOSE_FILE"
[ -f "$ENV_FILE" ] || die "Missing .env — copy .env.production.example to .env and fill secrets first"

# Warn on placeholder/empty required secrets (no AWS calls).
for key in POSTGRES_PASSWORD SECRETS_ENC_KEY COOLIFY_API_URL COOLIFY_API_TOKEN CORS_ORIGINS PRAXARCH_DOMAIN; do
  val="$(grep -E "^${key}=" "$ENV_FILE" | head -1 | cut -d= -f2- || true)"
  case "$val" in
    ""|"change-me"*|"praxarch.example.com"|"https://praxarch.example.com"|"https://coolify.internal.example.com")
      log "WARNING: ${key} looks unset/placeholder in .env" ;;
  esac
done

# ── 2. Docker ───────────────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker Engine…"
  curl -fsSL https://get.docker.com | sh
else
  log "Docker present: $(docker --version)"
fi

if ! docker compose version >/dev/null 2>&1; then
  die "Docker Compose v2 plugin not available — install docker-compose-plugin"
fi

# ── 3. Build + up ───────────────────────────────────────────────────
log "Building images (this can take a few minutes)…"
docker compose -f "$COMPOSE_FILE" build

log "Starting stack…"
docker compose -f "$COMPOSE_FILE" up -d --no-attach postgres --no-attach redis

# ── 4. Wait for API health ──────────────────────────────────────────
log "Waiting for API /health…"
for i in $(seq 1 30); do
  if docker compose -f "$COMPOSE_FILE" exec -T api wget -qO- http://localhost:3901/health >/dev/null 2>&1; then
    log "API healthy:"
    docker compose -f "$COMPOSE_FILE" exec -T api wget -qO- http://localhost:3901/health || true
    echo
    break
  fi
  sleep 3
  [ "$i" = "30" ] && log "WARNING: API not healthy after 90s — check: docker compose -f docker-compose.prod.yml logs api"
done

log "Done. Stack status:"
docker compose -f "$COMPOSE_FILE" ps
log "Next: point DNS (${PRAXARCH_DOMAIN:-your domain}) at this host; Caddy will issue TLS on first HTTPS hit."
