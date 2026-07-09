/** Reclaim docker build cache on prod (safe, non-destructive to running containers). */
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
    "echo '=== before ==='",
    "df -h / | tail -1",
    "sudo docker builder prune -af 2>&1 | tail -2",
    "echo '=== after ==='",
    "df -h / | tail -1",
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
