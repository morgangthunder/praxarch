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
  const pk = keys.find((k) => k.uuid === (srv.private_key_uuid || srv.private_key_id))?.private_key;
  const kp = join(tmpdir(), "k");
  await writeFile(kp, pk, { mode: 0o600 });
  const cmd = `bash -lc 'echo === coolify dirs ===; ls -la /data/coolify/applications 2>/dev/null | head -20 || echo no-coolify-apps; echo === docker ===; docker ps -a --format "{{.Names}} {{.Status}}" | head -15; echo === pm2 ===; pgrep -a pm2 || echo no-pm2; echo === disk ===; df -h / | tail -1; echo === build log ===; wc -l /tmp/bubblbook-prod-build.log 2>/dev/null; cat /tmp/bubblbook-prod-build.log 2>/dev/null | tail -5'`;
  try {
    const { stdout } = await execFileAsync(
      "ssh",
      ["-i", kp, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", `ubuntu@${srv.ip}`, cmd],
      { timeout: 90000, maxBuffer: 4 * 1024 * 1024 }
    );
    console.log(stdout);
  } finally {
    await unlink(kp).catch(() => undefined);
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
