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
  const keyPath = join(tmpdir(), `p-${randomBytes(4).toString("hex")}`);
  await writeFile(keyPath, pk, { mode: 0o600 });
  const root = "/data/coolify/applications/gacc5qlsha4e9nrqk1vf58b3";
  const cmd = [
    `APP=$(docker ps --format '{{.Names}}' | grep '^app-gacc5' | head -1)`,
    "echo '=== docker-compose.mcp.yml ==='",
    `head -80 ${root}/docker-compose.mcp.yml`,
    "echo '=== grep onboarding-agent in repo ==='",
    `grep -rn 'onboarding-agent\\|ONBOARDING_AGENT\\|\\.secret' ${root}/Back-end 2>/dev/null | head -25`,
    "echo '=== .secret example ==='",
    `head -20 ${root}/Back-end/.secret.example 2>/dev/null || head -20 ${root}/Back-end/.env.example 2>/dev/null || ls ${root}/Back-end/.secret* 2>/dev/null`,
    "echo '=== app .secret mount ==='",
    "docker exec $APP ls -la /app/.secret /app/Back-end/.secret 2>/dev/null; docker exec $APP find /app -name '.secret*' -maxdepth 3 2>/dev/null",
    "echo '=== api status direct ==='",
    "curl -sk -H 'Accept: application/json' http://127.0.0.1:3303/api/onboarding-agent/status",
    "echo",
  ].join(" && ");
  try {
    const { stdout } = await execFileAsync("ssh", ["-i", keyPath, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", "-p", "22", `ubuntu@${srv.ip}`, cmd], { timeout: 90000, maxBuffer: 5*1024*1024 });
    console.log(stdout);
  } finally { await unlink(keyPath).catch(() => {}); }
}
main().catch(e => { console.error(e.message); process.exit(1); });
