/**
 * Bootstrap Coolify app dir on prod from existing PM2 checkout, then start backend-only build.
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
const PM2_REPO = "/home/ubuntu/apps/master/bubbl_book";

async function getPk() {
  const token = process.env.COOLIFY_API_TOKEN;
  const base = (process.env.COOLIFY_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
  const h = { Authorization: `Bearer ${token}` };
  const srv = await fetch(`${base}/api/v1/servers/${SERVER_UUID}`, { headers: h }).then((r) => r.json());
  const keys = await fetch(`${base}/api/v1/security/keys`, { headers: h }).then((r) => r.json());
  const kid = srv.private_key_uuid || srv.private_key_id;
  return {
    pk: keys.find((k) => k.uuid === kid || k.id === kid)?.private_key,
    ip: srv.ip,
  };
}

async function ssh(pk, ip, cmd, timeout = 300000) {
  const keyPath = join(tmpdir(), `k-${Date.now()}`);
  await writeFile(keyPath, pk, { mode: 0o600 });
  try {
    const { stdout, stderr } = await execFileAsync(
      "ssh",
      ["-i", keyPath, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", `ubuntu@${ip}`, cmd],
      { timeout, maxBuffer: 8 * 1024 * 1024 }
    );
    return (stdout || "") + (stderr || "");
  } finally {
    await unlink(keyPath).catch(() => undefined);
  }
}

async function main() {
  const { pk, ip } = await getPk();
  if (!pk) throw new Error("no ssh key");

  const bootstrap = [
    "#!/bin/bash",
    "set -e",
    `test -d ${PM2_REPO} || { echo MISSING_PM2_REPO; exit 1; }`,
    "sudo mkdir -p /data/coolify/applications",
    `sudo rm -rf ${COOLIFY_ROOT}`,
    `sudo cp -a ${PM2_REPO} ${COOLIFY_ROOT}`,
    `sudo chown -R ubuntu:ubuntu ${COOLIFY_ROOT}`,
    `cd ${COOLIFY_ROOT}`,
    "git fetch origin master 2>/dev/null || true",
    "git checkout master 2>/dev/null || true",
    "git pull origin master 2>/dev/null || echo 'git pull skipped'",
    "ls -la docker-compose.yml docker-compose.yaml 2>/dev/null || ls -la | head -15",
    "test -f docker-compose.mcp.yml || echo 'WARN: no docker-compose.mcp.yml'",
    "echo BOOTSTRAP_DONE",
  ].join("\n");

  console.log("=== bootstrap ===");
  console.log(await ssh(pk, ip, `bash -lc '${bootstrap.replace(/'/g, "'\\''")}'`, 300000));
  console.log("Bootstrap complete — run start-prod-build-backend-only.js next");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
