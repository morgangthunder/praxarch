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
  const pk = keys.find((k) => k.uuid === (srv.private_key_uuid || srv.private_key_id) || k.id === srv.private_key_id)?.private_key;
  const keyPath = join(tmpdir(), `p-${randomBytes(4).toString("hex")}`);
  await writeFile(keyPath, pk, { mode: 0o600 });
  const cmd = [
    "APP=$(docker ps --format '{{.Names}}' | grep '^app-gacc5' | head -1)",
    "docker exec $APP grep -rn agreeatime /app/routes 2>/dev/null | head -10",
    "docker exec $APP sh -c \"grep -n 'app/g' /app/server.js | head -15\"",
    "echo '--- compose on host ---'",
    "find /data/coolify -name 'docker-compose.yml' 2>/dev/null | grep gacc5qlsha4e9nrqk1vf58b3 | head -3",
    "COMPOSE=$(find /data/coolify -path '*gacc5qlsha4e9nrqk1vf58b3*' -name docker-compose.yml 2>/dev/null | head -1)",
    "echo compose=$COMPOSE",
    "sudo cat $COMPOSE 2>/dev/null | head -80",
    "echo '--- legacy stopped containers ---'",
    "docker ps -a --format '{{.Names}} {{.Status}} {{.Ports}}' | grep -E 'work-|agree|3301|3302' || true",
  ].join(" && ");
  try {
    const { stdout } = await execFileAsync("ssh", ["-i", keyPath, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", "-p", "22", `ubuntu@${srv.ip}`, cmd], { timeout: 90000, maxBuffer: 10*1024*1024 });
    console.log(stdout);
  } finally { await unlink(keyPath).catch(()=>{}); }
}
main().catch(e => { console.error(e.message); process.exit(1); });
