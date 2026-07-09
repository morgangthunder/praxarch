/** Post-reboot prod state: disk, containers, mongo counts, site health. */
const { execFile } = require("child_process");
const { promisify } = require("util");
const { writeFile, unlink } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");
const execFileAsync = promisify(execFile);

async function main() {
  const token = process.env.COOLIFY_API_TOKEN;
  const base = (process.env.COOLIFY_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
  const h = { Authorization: `Bearer ${token}` };
  const srv = await fetch(`${base}/api/v1/servers/ray76gl90ckl5iur3fk2zgvt`, { headers: h }).then((r) => r.json());
  const keys = await fetch(`${base}/api/v1/security/keys`, { headers: h }).then((r) => r.json());
  const pk = keys.find((k) => k.uuid === (srv.private_key_uuid || srv.private_key_id) || k.id === srv.private_key_id)?.private_key;
  const kp = join(tmpdir(), `k-${Date.now()}`);
  await writeFile(kp, pk, { mode: 0o600 });
  const cmd = [
    "echo '=== disk ==='",
    "df -h / | tail -1",
    "echo '=== docker ps ==='",
    "docker ps --format 'table {{.Names}}\\t{{.Status}}\\t{{.Ports}}'",
    "echo '=== mongo counts (docker 27018) ==='",
    "docker exec mongo-latest mongosh --quiet bubblbook --eval 'print(\"users=\"+db.users.countDocuments()+\" activities=\"+db.activities.countDocuments())' 2>&1 | tail -2",
    "echo '=== app env ==='",
    "APP=$(docker ps --format '{{.Names}}' | grep -E '^work-|^app-' | head -1); echo app=$APP",
    "[ -n \"$APP\" ] && docker exec \"$APP\" printenv MONGO_URI REDIS_HOST PORT 2>/dev/null | sed 's|://[^@]*@|://***@|'",
    "echo '=== curl ==='",
    "curl -s -o /dev/null -w 'local3300=%{http_code}\\n' --max-time 8 http://127.0.0.1:3300/ || echo local3300=down",
    "curl -sk -o /dev/null -w 'https_root=%{http_code}\\n' --max-time 10 https://bubblbook.com/ || echo https=down",
    "curl -sk -o /dev/null -w 'https_agree=%{http_code}\\n' --max-time 10 https://bubblbook.com/app/g/agreeatime || true",
    "echo '=== leftover build overlay ==='",
    "ls -la /data/coolify/applications/nf6adysipbutbwzslufhhoqg/docker-compose.praxarch-build.yml 2>/dev/null && cat /data/coolify/applications/nf6adysipbutbwzslufhhoqg/docker-compose.praxarch-build.yml 2>/dev/null || echo no_overlay",
    "echo '=== docker disk usage ==='",
    "docker system df 2>/dev/null | head -6",
  ].join("; ");
  try {
    const { stdout } = await execFileAsync(
      "ssh",
      ["-i", kp, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", "-o", "ConnectTimeout=20", "ubuntu@34.251.139.131", cmd],
      { timeout: 120000, maxBuffer: 8 * 1024 * 1024 }
    );
    console.log(stdout);
  } finally {
    await unlink(kp).catch(() => undefined);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
