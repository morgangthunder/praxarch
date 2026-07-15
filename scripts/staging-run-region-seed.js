/** Run seed-regions + backfill-listing-base on staging app container. */
const { execFile } = require("child_process");
const { promisify } = require("util");
const { writeFile, unlink } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");
const execFileAsync = promisify(execFile);

const STAGING_SERVER = "rorxx790bkr8db4ssro9v5fh";

async function ssh(pk, ip, cmd, timeout = 300_000) {
  const kp = join(tmpdir(), `k-${Date.now()}`);
  await writeFile(kp, pk, { mode: 0o600 });
  try {
    const { stdout, stderr } = await execFileAsync(
      "ssh",
      [
        "-i",
        kp,
        "-o",
        "BatchMode=yes",
        "-o",
        "StrictHostKeyChecking=accept-new",
        "-o",
        "UserKnownHostsFile=NUL",
        "-o",
        "ConnectTimeout=15",
        `ubuntu@${ip}`,
        cmd,
      ],
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
    'APP=$(docker ps --format "{{.Names}}" | grep -E "^(app-gacc|work-latest)" | head -1)',
    'if [ -z "$APP" ]; then echo "NO_APP_CONTAINER"; exit 1; fi',
    'echo "app=$APP"',
    'docker exec "$APP" node -p "require(\\"./package.json\\").version"',
    'echo "=== script check ==="',
    'docker exec "$APP" ls -la scripts/ 2>&1 | head -20',
    'if docker exec "$APP" test -f scripts/seed-regions.js; then',
    '  echo "=== seed-regions.js ==="',
    '  docker exec "$APP" node scripts/seed-regions.js',
    'else',
    '  echo "MISSING scripts/seed-regions.js — image may predate location work (need 1.1.46+)"',
    '  exit 2',
    'fi',
    'if docker exec "$APP" test -f scripts/backfill-listing-base.js; then',
    '  echo "=== backfill-listing-base.js --no-google ==="',
    '  docker exec "$APP" node scripts/backfill-listing-base.js --no-google',
    'else',
    '  echo "MISSING scripts/backfill-listing-base.js"',
    '  exit 3',
    'fi',
  ].join("\n");

  const b64 = Buffer.from(script).toString("base64");
  try {
    const { stdout, stderr } = await ssh(pk, srv.ip, `echo ${b64} | base64 -d | bash`);
    console.log(stdout.trim());
    if (stderr?.trim()) console.error(stderr.trim());
  } catch (e) {
    if (e.stdout) console.log(String(e.stdout).trim());
    if (e.stderr) console.error(String(e.stderr).trim());
    throw e;
  }
}

main().catch((e) => {
  console.error("ERR", e.message);
  process.exit(typeof e.code === "number" ? e.code : 1);
});
