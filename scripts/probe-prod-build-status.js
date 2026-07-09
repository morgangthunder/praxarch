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
  const kid = srv.private_key_uuid || srv.private_key_id;
  const pk = keys.find((k) => k.uuid === kid || k.id === kid)?.private_key;
  const kp = join(tmpdir(), "k");
  await writeFile(kp, pk, { mode: 0o600 });
  const cmd = `bash -lc 'test -f /tmp/bubblbook-prod-build.done && echo STATUS=DONE || echo STATUS=RUNNING; pgrep -af rebuild-prod || true; tail -15 /tmp/bubblbook-prod-build.log 2>/dev/null || echo no-log; docker ps --format "{{.Names}} {{.Status}}" | grep -E "app-|mcp" || true'`;
  try {
    const { stdout } = await execFileAsync(
      "ssh",
      ["-i", kp, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", `ubuntu@${srv.ip}`, cmd],
      { timeout: 60000, maxBuffer: 2 * 1024 * 1024 }
    );
    console.log(stdout);
  } finally {
    await unlink(kp).catch(() => undefined);
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
