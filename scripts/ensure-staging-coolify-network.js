/**
 * Ensure the external `coolify` Docker network exists on the staging server.
 * Coolify deploys attach app containers to this network; if it was pruned
 * (disk cleanup / docker restart) deploys fail with "network coolify not found".
 *
 * Run:  node scripts/ensure-staging-coolify-network.js
 * Env:  COOLIFY_API_URL (default http://127.0.0.1:8000), COOLIFY_API_TOKEN
 */
const { execFile } = require("child_process");
const { promisify } = require("util");
const { writeFile, unlink } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");
const execFileAsync = promisify(execFile);

const SERVER_UUID = process.env.STAGING_SERVER_UUID || "rorxx790bkr8db4ssro9v5fh";

async function ssh(pk, ip, cmd, timeout = 60000) {
  const keyPath = join(tmpdir(), `p-${Date.now()}`);
  await writeFile(keyPath, pk, { mode: 0o600 });
  try {
    const { stdout } = await execFileAsync(
      "ssh",
      ["-i", keyPath, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", "-o", "ConnectTimeout=20", `ubuntu@${ip}`, cmd],
      { timeout, maxBuffer: 4 * 1024 * 1024 }
    );
    return stdout;
  } finally {
    await unlink(keyPath).catch(() => undefined);
  }
}

async function main() {
  const token = process.env.COOLIFY_API_TOKEN;
  const base = (process.env.COOLIFY_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
  if (!token) throw new Error("COOLIFY_API_TOKEN required");
  const h = { Authorization: `Bearer ${token}` };
  const srv = await fetch(`${base}/api/v1/servers/${SERVER_UUID}`, { headers: h }).then((r) => r.json());
  const keys = await fetch(`${base}/api/v1/security/keys`, { headers: h }).then((r) => r.json());
  const kid = srv.private_key_uuid || srv.private_key_id;
  const pk = keys.find((k) => k.uuid === kid || k.id === kid)?.private_key;
  if (!pk) throw new Error("SSH private key not found for staging server");

  const cmd = [
    "docker network inspect coolify >/dev/null 2>&1 && echo EXISTS || (docker network create --attachable coolify && echo CREATED)",
    "echo '--- networks ---'",
    "docker network ls --format '{{.Name}}' | grep -E 'coolify|mcp' || true",
  ].join("; ");

  console.log(`staging ${srv.ip}:`);
  console.log(await ssh(pk, srv.ip, cmd));
}

main().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
