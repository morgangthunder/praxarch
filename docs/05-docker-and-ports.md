# Docker & Port Allocation

Everything in Praxarch runs from Docker. Ports are deliberately chosen to **not clash** with the other repos on this machine (Bubblbook, Upora, Bloomix).

---

## Praxarch port map

| Service | Host port | Container | URL |
|---|---|---|---|
| Web (Next.js) | **3900** | 3000 | http://localhost:3900 |
| API (NestJS) | **3901** | 3901 | http://localhost:3901 |
| PostgreSQL | **5440** | 5432 | `postgres://praxarch:praxarch@localhost:5440/praxarch` |
| Redis | **6390** | 6379 | `redis://localhost:6390` |
| n8n | **5690** | 5678 | http://localhost:5690 |

Internally (on the `praxarch_net` network) services talk by name: `api → postgres:5432 / redis:6379 / n8n:5678`, and the web BFF reaches `api:3901`.

---

## Clash-avoidance reference (host ports already taken)

| Repo | Host ports in use |
|---|---|
| **Upora** (lessix) | 3000, 3001, 5432, 5678, 6333, 6334, 6379, 8100, 9000, 9001 |
| **Bubblbook** | 1025, 3303, 4040, 4200, 6378, 8025, 27018 |
| **Bloomix** | 3000, 5432, 5500, 5678, 6379, 8080, 8100, 8300, 9000, 9001, 50051 |

Praxarch's block (**3900, 3901, 5440, 6390, 5690**) intersects none of the above — all five repos can run simultaneously.

> When adding a new Praxarch service, keep it inside the reserved lanes: **39xx** (apps), **54x0** (databases), **63x0/56x0** (caches/orchestration). Re-check this table first.

---

## Running the stack

The compose file is at the repo root. Flags follow the project convention of avoiding TTY hangs.

```bash
# Copy env and fill secrets
cp .env.example .env

# Build app images
docker compose build

# Start everything detached (no TTY attach)
docker compose up -d

# …or bring up infra first, then apps
docker compose up -d --no-attach postgres --no-attach redis --no-attach n8n

# Tail logs (version banner prints on boot)
docker compose logs -f api web

# Stop
docker compose down            # add -v to also drop volumes (DB reset)
```

Expected boot banners (confirms the running build):

```
praxarch-api  | 🚀 Praxarch API v0.2.0 listening on :3901
praxarch-web  | 🟣 Praxarch Web v0.2.0 — API: http://api:3901
```

---

## Notes

- **Dev mode + hot reload:** `web` and `api` use the `dev` Dockerfile target with bind-mounted source. Named volumes hold `node_modules` (and `.next`) so the empty host folders don't shadow the container's installed deps. Edit files on the host → containers reload.
- **No lockfile yet:** images run `npm install` (not `npm ci`). Commit the generated `package-lock.json` after the first build for reproducible installs.
- **Postgres bootstrap:** `infra/postgres/init/001-init.sql` runs once on a fresh volume — creates the `public` platform catalog (tenants, prompt registry, usage rollups). Tenant schemas are created by the API at onboarding.
- **Production targets:** each Dockerfile also has a `prod` stage (`node dist/main.js` / Next.js standalone) for Coolify deploys.
