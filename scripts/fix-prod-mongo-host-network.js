/**
 * Production app must reach host Mongo on 127.0.0.1:27017 (PM2 legacy).
 * Docker bridge cannot reach bind-address 127.0.0.1 — use host network for app.
 */
const { execFile } = require("child_process");
const { promisify } = require("util");
const { writeFile, unlink } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");
const execFileAsync = promisify(execFile);

const SERVER_IP = "34.251.139.131";
const COOLIFY_ROOT = "/data/coolify/applications/nf6adysipbutbwzslufhhoqg";

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

async function ssh(pk, cmd, timeout = 180000) {
  const keyPath = join(tmpdir(), `k-${Date.now()}`);
  await writeFile(keyPath, pk, { mode: 0o600 });
  try {
    const { stdout, stderr } = await execFileAsync(
      "ssh",
      ["-i", keyPath, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", "-o", "ConnectTimeout=20", `ubuntu@${SERVER_IP}`, cmd],
      { timeout, maxBuffer: 4 * 1024 * 1024 }
    );
    return (stdout || "") + (stderr || "");
  } finally {
    await unlink(keyPath).catch(() => undefined);
  }
}

async function main() {
  const token = process.env.COOLIFY_API_TOKEN;
  const base = (process.env.COOLIFY_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
  const h = { Authorization: `Bearer ${token}` };
  const keys = await fetch(`${base}/api/v1/security/keys`, { headers: h }).then((r) => r.json());
  const pk = keys.find((k) => k.id === 1)?.private_key;
  if (!pk) throw new Error("SSH key not found");

  const overlayB64 = Buffer.from(OVERLAY).toString("base64");
  const remoteScript = [
    "#!/bin/bash",
    "set -e",
    `cd ${COOLIFY_ROOT}`,
    "sed -i 's|@mongo:27017|@localhost:27017|g' Back-end/.secret .env 2>/dev/null || true",
    `grep -q '^ONBOARDING_AGENT_MCP_URL=' Back-end/.secret && sed -i 's|^ONBOARDING_AGENT_MCP_URL=.*|ONBOARDING_AGENT_MCP_URL=http://127.0.0.1:3400|' Back-end/.secret || echo 'ONBOARDING_AGENT_MCP_URL=http://127.0.0.1:3400' >> Back-end/.secret`,
    `echo '${overlayB64}' | base64 -d > docker-compose.praxarch-build.yml`,
    "sudo docker compose -f docker-compose.yml -f docker-compose.praxarch-build.yml -f docker-compose.mcp.yml up -d --force-recreate app",
    "sleep 15",
    "docker exec work-latest printenv MONGO_URI 2>/dev/null | sed 's/:\\/\\/[^@]*@/:\\/\\/***@/' || true",
    "docker logs work-latest 2>&1 | grep -iE 'mongo|connected|authentication|error' | tail -6",
    "curl -s -o /dev/null -w 'health=%{http_code}\\n' http://127.0.0.1:3300/",
    "curl -s https://bubblbook.com/api/onboarding-agent/status | head -c 120",
    "echo",
  ].join("\n");

  const b64 = Buffer.from(remoteScript).toString("base64");
  console.log(await ssh(pk, `echo '${b64}' | base64 -d | bash`));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
