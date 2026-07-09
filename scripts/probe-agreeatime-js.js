const { execFile } = require("child_process");
const { promisify } = require("util");
const { writeFile, unlink } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");
const { randomBytes } = require("crypto");
const execFileAsync = promisify(execFile);

async function main() {
  const token = process.env.COOLIFY_API_TOKEN;
  const base = process.env.COOLIFY_API_URL.replace(/\/$/, "");
  const h = { Authorization: `Bearer ${token}` };
  const srv = await fetch(`${base}/api/v1/servers/rorxx790bkr8db4ssro9v5fh`, { headers: h }).then((r) => r.json());
  const keys = await fetch(`${base}/api/v1/security/keys`, { headers: h }).then((r) => r.json());
  const kid = srv.private_key_uuid || srv.private_key_id;
  const pk = keys.find((k) => k.uuid === kid || k.id === kid)?.private_key;
  if (!pk) throw new Error("SSH key unavailable");
  const keyPath = join(tmpdir(), `p-${randomBytes(4).toString("hex")}`);
  await writeFile(keyPath, pk, { mode: 0o600 });
  const cmd = [
    "APP=$(docker ps --format '{{.Names}}' | grep '^app-gacc5' | head -1)",
    "docker exec $APP sh -c \"grep -l agreeatime /app/public/browser/*.js 2>/dev/null | head -3\"",
    "docker exec $APP sh -c \"grep -o '.{0,30}agreeatime.{0,30}' /app/public/browser/main*.js 2>/dev/null | head -5\"",
    "docker exec $APP sh -c \"zgrep -h 'agreeatime' /app/public/browser/*.js 2>/dev/null | head -1 | cut -c1-200\"",
    "docker exec $APP sh -c \"grep -rhoE '/2[a-zA-Z0-9/_-]*agreeatime|agreeatime[^\\\"'\\']*' /app/public/browser/main*.js 2>/dev/null | sort -u | head -10\"",
    "echo '--- chunk files ---'",
    "docker exec $APP ls /app/public/browser/*agree* 2>/dev/null; docker exec $APP find /app/public/browser -name '*agree*' 2>/dev/null | head -10",
  ].join(" && ");
  try {
    const { stdout } = await execFileAsync("ssh", ["-i", keyPath, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", "-p", "22", `ubuntu@${srv.ip}`, cmd], { timeout: 90000 });
    console.log(stdout);
  } finally { await unlink(keyPath).catch(() => {}); }
}
main().catch(e => { console.error(e.message); process.exit(1); });
