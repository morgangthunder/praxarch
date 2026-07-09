const { execFile } = require("child_process");
const { promisify } = require("util");
const { writeFile, unlink } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");
const { randomBytes } = require("crypto");
const execFileAsync = promisify(execFile);

async function ssh(pk, ip, cmd) {
  const keyPath = join(tmpdir(), `p-${randomBytes(4).toString("hex")}`);
  await writeFile(keyPath, pk, { mode: 0o600 });
  try {
    const { stdout } = await execFileAsync(
      "ssh",
      ["-i", keyPath, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", "-p", "22", `ubuntu@${ip}`, cmd],
      { timeout: 120000, maxBuffer: 4 * 1024 * 1024 }
    );
    return stdout;
  } finally {
    await unlink(keyPath).catch(() => undefined);
  }
}

async function main() {
  const token = process.env.COOLIFY_API_TOKEN;
  const base = process.env.COOLIFY_API_URL.replace(/\/$/, "");
  const h = { Authorization: `Bearer ${token}` };
  const srv = await fetch(`${base}/api/v1/servers/rorxx790bkr8db4ssro9v5fh`, { headers: h }).then((r) => r.json());
  const keys = await fetch(`${base}/api/v1/security/keys`, { headers: h }).then((r) => r.json());
  const kid = srv.private_key_uuid || srv.private_key_id;
  const pk = keys.find((k) => k.uuid === kid || k.id === kid)?.private_key;

  const cmd = [
    "echo '=== nginx api routes ==='",
    "sudo grep -rn 'location.*api\\|proxy_pass.*330' /etc/nginx/sites-enabled/ 2>/dev/null | head -25",
    "echo '=== direct backend 3303 ==='",
    "curl -s http://127.0.0.1:3303/api/onboarding-agent/status -H 'Accept: application/json' | head -c 300",
    "echo",
    "curl -s -o /dev/null -w '3303_health=%{http_code}\\n' http://127.0.0.1:3303/api/health",
    "echo '=== find provider-factory path ==='",
    "APP=$(docker ps --format '{{.Names}}' | grep '^app-gacc5' | head -1)",
    "docker exec $APP find /app -name 'provider-factory.js' 2>/dev/null",
    "docker exec $APP find /app -name 'onboardingAgent.controller.js' 2>/dev/null",
    "docker exec $APP sh -c 'grep -rn onboarding-agent /app/server.js /app/Back-end/server.js 2>/dev/null | head -5'",
  ].join(" && ");

  console.log(await ssh(pk, srv.ip, cmd));
}
main().catch((e) => { console.error(e.message); process.exit(1); });
