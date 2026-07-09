/**
 * Backend-only production build: new Back-end + existing public/ from legacy PM2 tree.
 * Avoids ENOSPC from full Angular build on constrained disk.
 */
const { execFile } = require("child_process");
const { promisify } = require("util");
const { writeFile, unlink } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");
const execFileAsync = promisify(execFile);

const SERVER_UUID = "ray76gl90ckl5iur3fk2zgvt";
const APP_UUID = "nf6adysipbutbwzslufhhoqg";
const COOLIFY_ROOT = `/data/coolify/applications/${APP_UUID}`;
const PM2_PUBLIC = "/home/ubuntu/apps/master/bubbl_book/Back-end/public";

const BACKEND_DOCKERFILE = `############################
# Praxarch production: backend-only (reuse legacy public/)
############################
FROM node:22-bookworm AS backend-build
WORKDIR /Back-end
COPY Back-end/package*.json ./
RUN npm ci --prefer-offline --fetch-timeout=120000 --fetch-retries=5
COPY Back-end .

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=backend-build /Back-end .
COPY public /app/public
EXPOSE 3300
CMD ["node", "server.js"]
`;

const OVERLAY = `services:
  app:
    build:
      context: .
      dockerfile: Dockerfile.praxarch-backend
    image: praxarch-local-app:latest
    network_mode: host
    ports: []
    environment:
      - REDIS_HOST=127.0.0.1
      - REDIS_PORT=6378
`;

async function ssh(pk, ip, cmd, timeout = 120000) {
  const keyPath = join(tmpdir(), `k-${Date.now()}`);
  await writeFile(keyPath, pk, { mode: 0o600 });
  try {
    const { stdout, stderr } = await execFileAsync(
      "ssh",
      ["-i", keyPath, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", "-o", "ConnectTimeout=30", `ubuntu@${ip}`, cmd],
      { timeout, maxBuffer: 4 * 1024 * 1024 }
    );
    return stdout || stderr;
  } finally {
    await unlink(keyPath).catch(() => undefined);
  }
}

async function main() {
  const token = process.env.COOLIFY_API_TOKEN;
  const base = process.env.COOLIFY_API_URL.replace(/\/$/, "");
  const h = { Authorization: `Bearer ${token}` };
  const srv = await fetch(`${base}/api/v1/servers/${SERVER_UUID}`, { headers: h }).then((r) => r.json());
  const keys = await fetch(`${base}/api/v1/security/keys`, { headers: h }).then((r) => r.json());
  const kid = srv.private_key_uuid || srv.private_key_id;
  const pk = keys.find((k) => k.uuid === kid || k.id === kid)?.private_key;
  if (!pk) throw new Error("SSH private key not found");
  const ip = srv.ip;

  const dfB64 = Buffer.from(BACKEND_DOCKERFILE).toString("base64");
  const overlayB64 = Buffer.from(OVERLAY).toString("base64");

  const buildScript = [
    "#!/bin/bash",
    "set -e",
    `cd ${COOLIFY_ROOT}`,
    "echo '=== disk before ==='",
    "df -h / | tail -1",
    "sudo docker builder prune -af 2>&1 | tail -2 || true",
    "sudo docker image prune -f 2>&1 | tail -2 || true",
    `test -d ${PM2_PUBLIC} || { echo "MISSING_PM2_PUBLIC"; exit 1; }`,
    "rm -rf public-prod-snapshot",
    `cp -a ${PM2_PUBLIC} ./public-prod-snapshot`,
    "rm -rf public && mv public-prod-snapshot public",
    `echo '${dfB64}' | base64 -d > Dockerfile.praxarch-backend`,
    `echo '${overlayB64}' | base64 -d > docker-compose.praxarch-build.yml`,
    "export DOCKER_BUILDKIT=1",
    "sudo -E docker compose -f docker-compose.yml -f docker-compose.praxarch-build.yml build --progress=plain app",
    "sudo docker compose -f docker-compose.yml -f docker-compose.praxarch-build.yml -f docker-compose.mcp.yml up -d app mcp",
    'APP=$(docker ps --format "{{.Names}}" | grep "^app-" | head -1)',
    'MCP_NET=$(docker inspect mcp-server --format "{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}" 2>/dev/null | awk "{print \\$1}")',
    'APP_NET=$(docker inspect "$APP" --format "{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}" 2>/dev/null | awk "{print \\$1}")',
    'docker network inspect "$MCP_NET" --format "{{range .Containers}}{{.Name}} {{end}}" | grep -q "$APP" || docker network connect "$MCP_NET" "$APP"',
    'docker network inspect "$APP_NET" --format "{{range .Containers}}{{.Name}} {{end}}" | grep -q mcp-server || docker network connect "$APP_NET" mcp-server',
    "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | head -8",
    "echo DONE > /tmp/bubblbook-prod-build.done",
  ].join("\n");

  const scriptB64 = Buffer.from(buildScript).toString("base64");
  const start = [
    `echo '${scriptB64}' | base64 -d > /tmp/rebuild-prod.sh`,
    "chmod +x /tmp/rebuild-prod.sh",
    "rm -f /tmp/bubblbook-prod-build.done /tmp/bubblbook-prod-build.log",
    "nohup /tmp/rebuild-prod.sh > /tmp/bubblbook-prod-build.log 2>&1 </dev/null & disown",
    "sleep 2",
    "echo BUILD_STARTED",
    "pgrep -af rebuild-prod || true",
    "df -h / | tail -1",
  ].join("; ");

  console.log(await ssh(pk, ip, start, 90000));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
