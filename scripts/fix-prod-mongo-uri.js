/**
 * Fix production MONGO_URI: localhost:27017 → mongo:27017 for Docker networking.
 * Updates on-disk env, Praxarch vault, and recreates the app container.
 */
const { execFile } = require("child_process");
const { promisify } = require("util");
const { writeFile, unlink } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");
const execFileAsync = promisify(execFile);

const SERVER_IP = "34.251.139.131";
const COOLIFY_ROOT = "/data/coolify/applications/nf6adysipbutbwzslufhhoqg";

async function ssh(pk, cmd, timeout = 120000) {
  const keyPath = join(tmpdir(), `k-${Date.now()}`);
  await writeFile(keyPath, pk, { mode: 0o600 });
  try {
    const { stdout, stderr } = await execFileAsync(
      "ssh",
      ["-i", keyPath, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", `ubuntu@${SERVER_IP}`, cmd],
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

  const remoteScript = [
    "#!/bin/bash",
    "set -e",
    `cd ${COOLIFY_ROOT}`,
    "echo '=== before ==='",
    "grep MONGO_URI .env Back-end/.env 2>/dev/null || true",
    "for f in .env Back-end/.env; do",
    '  [ -f "$f" ] && sed -i "s|@localhost:27017|@mongo:27017|g" "$f"',
    "done",
    "echo '=== after ==='",
    "grep MONGO_URI .env Back-end/.env 2>/dev/null || true",
    "sudo docker compose -f docker-compose.yml -f docker-compose.praxarch-build.yml -f docker-compose.mcp.yml up -d app",
    "sleep 8",
    "docker logs work-latest 2>&1 | tail -8",
    "curl -s -o /dev/null -w 'health=%{http_code}\\n' http://127.0.0.1:3300/",
  ].join("\n");

  const b64 = Buffer.from(remoteScript).toString("base64");
  const out = await ssh(pk, `echo '${b64}' | base64 -d | bash`, 180000);
  console.log(out);

  const mongoLine = await ssh(pk, `grep '^MONGO_URI=' ${COOLIFY_ROOT}/.env | head -1`);
  const envText = mongoLine.trim();
  if (!envText.startsWith("MONGO_URI=")) throw new Error("MONGO_URI not found after fix");

  const apiBase = (process.env.API_URL || "http://localhost:3901").replace(/\/$/, "");
  const res = await fetch(`${apiBase}/capabilities/deployments.setServiceEnvVars/invoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-praxarch-tenant": "bubblbook" },
    body: JSON.stringify({
      input: {
        serviceId: "bubblbook",
        environment: "production",
        envText,
        merge: true,
        syncToCoolify: false,
      },
    }),
  });
  const body = await res.json();
  console.log("vault:", JSON.stringify(body));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
