/** Read-only: compare whether PM2 on production has lowercase `secret` (length only). */
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
  const serverUuid = "ray76gl90ckl5iur3fk2zgvt";
  const headers = { Authorization: `Bearer ${token}` };
  const srv = await fetch(`${base}/api/v1/servers/${serverUuid}`, { headers }).then((r) => r.json());
  const keys = await fetch(`${base}/api/v1/security/keys`, { headers }).then((r) => r.json());
  const keyId = srv.private_key_uuid || srv.private_key_id;
  const keyObj = keys.find((k) => k.uuid === keyId || k.id === keyId);
  const privateKey = keyObj?.private_key;
  if (!privateKey) throw new Error("no ssh key");

  const keyPath = join(tmpdir(), `probe-${randomBytes(4).toString("hex")}`);
  await writeFile(keyPath, privateKey, { mode: 0o600 });
  const remoteCmd = `pm2 list 2>/dev/null | head -5; pm2 env 0 2>/dev/null | grep -E '^(secret|ADMIN_SECRET)=' | sed 's/=.*/=REDACTED/' || pm2 describe 0 2>/dev/null | grep -E 'secret|ADMIN_SECRET' | head -5`;

  try {
    const { stdout } = await execFileAsync(
      "ssh",
      ["-i", keyPath, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", "-p", String(srv.port || 22), `${srv.user || "root"}@${srv.ip}`, remoteCmd],
      { timeout: 30_000 }
    );
    console.log(stdout.trim());
  } finally {
    await unlink(keyPath).catch(() => undefined);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
