/** Emergency staging health probe when site times out. */
const { execFile } = require("child_process");
const { promisify } = require("util");
const { writeFile, unlink } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");
const execFileAsync = promisify(execFile);

async function ssh(pk, ip, cmd, timeout = 90000) {
  const keyPath = join(tmpdir(), `p-${Date.now()}`);
  await writeFile(keyPath, pk, { mode: 0o600 });
  try {
    const { stdout, stderr } = await execFileAsync(
      "ssh",
      ["-i", keyPath, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", "-o", "ConnectTimeout=15", "-p", "22", `ubuntu@${ip}`, cmd],
      { timeout, maxBuffer: 4 * 1024 * 1024 }
    );
    return stdout || stderr;
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
  if (!pk) throw new Error("no ssh key");

  const ip = srv.ip;
  console.log("host", ip, "status", srv.status || srv.is_reachable);

  const cmd = [
    "echo '=== uptime/load ==='",
    "uptime; free -h | head -2; df -h / | tail -1",
    "echo '=== nginx ==='",
    "systemctl is-active nginx 2>/dev/null || sudo systemctl is-active nginx 2>/dev/null || echo nginx_unknown",
    "echo '=== listeners 80/443/3303 ==='",
    "ss -tlnp 2>/dev/null | grep -E ':80 |:443 |:3303 ' || sudo ss -tlnp | grep -E ':80 |:443 |:3303 ' || true",
    "echo '=== docker ps ==='",
    "sudo docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | head -15",
    "echo '=== curl local ==='",
    "curl -s -o /dev/null -w '127.0.0.1:3303=%{http_code}\\n' --connect-timeout 3 http://127.0.0.1:3303/ || echo curl3303_fail",
    "curl -sk -o /dev/null -w 'localhost:443=%{http_code}\\n' --connect-timeout 3 https://127.0.0.1/ || echo curl443_fail",
    "echo '=== build state ==='",
    "test -f /tmp/bubblbook-staging-build.done && echo BUILD_DONE || echo BUILD_NOT_DONE",
    "pgrep -af 'docker compose|docker build' | head -5 || echo no_build",
    "tail -8 /tmp/bubblbook-staging-build.log 2>/dev/null || tail -8 /tmp/praxarch-build-gacc5qlsha4e9nrqk1vf58b3.log 2>/dev/null || echo no_build_log",
  ].join(" && ");

  try {
    console.log(await ssh(pk, ip, cmd));
  } catch (e) {
    console.error("SSH_FAILED:", e.message);
  }

  // external probe from praxarch-api container
  try {
    const ext = await fetch(`https://alpha.bubblbook.com/`, { signal: AbortSignal.timeout(15000) });
    console.log("external_https", ext.status);
  } catch (e) {
    console.error("external_https_FAIL:", e.message);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
