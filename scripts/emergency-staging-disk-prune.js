/** Emergency disk cleanup on staging before build can proceed. */
const { execFile } = require("child_process");
const { promisify } = require("util");
const { writeFile, unlink } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");
const execFileAsync = promisify(execFile);

async function ssh(pk, ip, cmd, timeout = 180000) {
  const keyPath = join(tmpdir(), `k-${Date.now()}`);
  await writeFile(keyPath, pk, { mode: 0o600 });
  try {
    const { stdout } = await execFileAsync(
      "ssh",
      ["-i", keyPath, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", "-o", "ConnectTimeout=30", `ubuntu@${ip}`, cmd],
      { timeout, maxBuffer: 4 * 1024 * 1024 }
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
    "echo BEFORE; df -h / | tail -1",
    "sudo docker system prune -af 2>&1 | tail -5",
    "sudo docker volume prune -f 2>&1 | tail -3",
    "sudo journalctl --vacuum-size=50M 2>&1 | tail -2",
    "echo AFTER; df -h / | tail -1",
    "free -h | head -2",
    "pgrep -af rebuild-staging || echo no_build",
    "tail -5 /tmp/bubblbook-staging-build.log 2>/dev/null || echo no_log",
  ].join("; ");

  console.log(await ssh(pk, srv.ip, cmd));
}

main().catch((e) => { console.error(e.message); process.exit(1); });
