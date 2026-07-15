/** Force-pull latest :staging ECR image and recreate app container. */
const { execFile } = require("child_process");
const { promisify } = require("util");
const { writeFile, unlink } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");
const execFileAsync = promisify(execFile);

const STAGING_APP = "gacc5qlsha4e9nrqk1vf58b3";
const STAGING_SERVER = "rorxx790bkr8db4ssro9v5fh";
const ROOT = `/data/coolify/applications/${STAGING_APP}`;
const IMAGE = "435214896413.dkr.ecr.eu-west-1.amazonaws.com/bubblbook/prod:staging";

async function ssh(pk, ip, cmd, timeout = 300_000) {
  const kp = join(tmpdir(), `k-${Date.now()}`);
  await writeFile(kp, pk, { mode: 0o600 });
  try {
    const { stdout, stderr } = await execFileAsync(
      "ssh",
      ["-i", kp, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=NUL", `ubuntu@${ip}`, cmd],
      { timeout, maxBuffer: 4 * 1024 * 1024 }
    );
    return { stdout, stderr };
  } finally {
    await unlink(kp).catch(() => undefined);
  }
}

async function main() {
  const token = process.env.COOLIFY_API_TOKEN;
  const base = (process.env.COOLIFY_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
  const h = { Authorization: `Bearer ${token}` };
  const keysRaw = await fetch(`${base}/api/v1/security/keys`, { headers: h }).then((r) => r.json());
  const keys = Array.isArray(keysRaw) ? keysRaw : keysRaw.data ?? [];
  const srv = await fetch(`${base}/api/v1/servers/${STAGING_SERVER}`, { headers: h }).then((r) => r.json());
  const kid = srv.private_key_uuid || srv.private_key_id;
  const pk = keys.find((k) => k.uuid === kid || k.id === kid)?.private_key;
  if (!pk) throw new Error("SSH key not found");

  const script = [
    "#!/bin/bash",
    "set -e",
    `cd "${ROOT}"`,
    'REG="435214896413.dkr.ecr.eu-west-1.amazonaws.com"',
    'REGION="eu-west-1"',
    'aws ecr get-login-password --region "$REGION" | sudo docker login --username AWS --password-stdin "$REG"',
    `sudo docker pull ${IMAGE}`,
    "sudo docker compose -f docker-compose.yml up -d --pull always --force-recreate app",
    'sleep 8',
    'APP=$(docker ps --format "{{.Names}}" | grep -E "^app-gacc" | head -1)',
    'echo app=$APP',
    'docker exec "$APP" node -p "require(\\"./package.json\\").version"',
    'docker exec "$APP" ls scripts/seed-regions.js scripts/backfill-listing-base.js',
  ].join("\n");

  const b64 = Buffer.from(script).toString("base64");
  const { stdout } = await ssh(pk, srv.ip, `echo ${b64} | base64 -d | bash`);
  console.log(stdout.trim());
}

main().catch((e) => {
  console.error("ERR", e.message);
  if (e.stdout) console.log(String(e.stdout));
  process.exit(1);
});
