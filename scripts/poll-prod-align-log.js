/** Tail full align log on prod. */
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
  try {
    const { stdout } = await execFileAsync(
      "ssh",
      ["-i", kp, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", "ubuntu@34.251.139.131", "test -f /tmp/bubblbook-prod-align.done && echo DONE || echo RUNNING; wc -l /tmp/bubblbook-prod-align.log 2>/dev/null; tail -40 /tmp/bubblbook-prod-align.log 2>/dev/null; docker ps --format '{{.Names}} {{.Status}}' | head -8"],
      { timeout: 300000, maxBuffer: 8 * 1024 * 1024 }
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
