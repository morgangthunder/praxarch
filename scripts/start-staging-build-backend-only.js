/**
 * Backend-only staging build: new Back-end code + existing frontend public/ from running container.
 * Avoids ENOSPC from full Angular npm ci + prerender on 20GB disk.
 */
const { execFile } = require("child_process");
const { promisify } = require("util");
const { writeFile, unlink } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");
const execFileAsync = promisify(execFile);

const BACKEND_DOCKERFILE = `############################
# Praxarch staging: backend-only (reuse existing public/)
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
EXPOSE 3303
CMD ["node", "server.js"]
`;

const OVERLAY = `services:
  app:
    build:
      context: .
      dockerfile: Dockerfile.praxarch-backend
    image: praxarch-local-app:latest
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
  const srv = await fetch(`${base}/api/v1/servers/rorxx790bkr8db4ssro9v5fh`, { headers: h }).then((r) => r.json());
  const keys = await fetch(`${base}/api/v1/security/keys`, { headers: h }).then((r) => r.json());
  const kid = srv.private_key_uuid || srv.private_key_id;
  const pk = keys.find((k) => k.uuid === kid || k.id === kid)?.private_key;
  const ip = srv.ip;
  const root = "/data/coolify/applications/gacc5qlsha4e9nrqk1vf58b3";

  const dfB64 = Buffer.from(BACKEND_DOCKERFILE).toString("base64");
  const overlayB64 = Buffer.from(OVERLAY).toString("base64");

  const buildScript = [
    "#!/bin/bash",
    "set -e",
    `cd ${root}`,
    "echo '=== disk before ==='",
    "df -h / | tail -1",
    "sudo docker builder prune -af 2>&1 | tail -2 || true",
    "sudo docker image prune -f 2>&1 | tail -2 || true",
    "APP=$(docker ps --format '{{.Names}}' | grep '^app-gacc5' | head -1)",
    "echo app=$APP",
    "rm -rf public-staging-snapshot",
    "docker cp \"$APP:/app/public\" ./public-staging-snapshot",
    "rm -rf public && mv public-staging-snapshot public",
    `echo '${dfB64}' | base64 -d > Dockerfile.praxarch-backend`,
    `echo '${overlayB64}' | base64 -d > docker-compose.praxarch-build.yml`,
    "export DOCKER_BUILDKIT=1",
    "sudo -E docker compose -f docker-compose.yml -f docker-compose.praxarch-build.yml build --progress=plain app",
    "sudo docker compose -f docker-compose.yml -f docker-compose.praxarch-build.yml -f docker-compose.mcp.yml up -d app mcp",
    "APP=$(docker ps --format '{{.Names}}' | grep -E '^app-' | head -1)",
    'MCP_NET=$(docker inspect mcp-server --format "{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}" 2>/dev/null | awk "{print \\$1}")',
    'APP_NET=$(docker inspect "$APP" --format "{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}" 2>/dev/null | awk "{print \\$1}")',
    'docker network inspect "$MCP_NET" --format "{{range .Containers}}{{.Name}} {{end}}" | grep -q "$APP" || docker network connect "$MCP_NET" "$APP"',
    'docker network inspect "$APP_NET" --format "{{range .Containers}}{{.Name}} {{end}}" | grep -q mcp-server || docker network connect "$APP_NET" mcp-server',
    "echo DONE > /tmp/bubblbook-staging-build.done",
  ].join("\n");

  const scriptB64 = Buffer.from(buildScript).toString("base64");
  const start = [
    `echo '${scriptB64}' | base64 -d > /tmp/rebuild-staging.sh`,
    "chmod +x /tmp/rebuild-staging.sh",
    "rm -f /tmp/bubblbook-staging-build.done /tmp/bubblbook-staging-build.log",
    "nohup /tmp/rebuild-staging.sh > /tmp/bubblbook-staging-build.log 2>&1 </dev/null & disown",
    "sleep 2",
    "echo BUILD_STARTED",
    "pgrep -af rebuild-staging || true",
    "df -h / | tail -1",
  ].join("; ");

  console.log(await ssh(pk, ip, start, 90000));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
