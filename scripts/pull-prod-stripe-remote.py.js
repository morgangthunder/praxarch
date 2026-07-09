const { execFile } = require("child_process");
const { promisify } = require("util");
const { writeFile, unlink } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");
const { randomBytes } = require("crypto");
const execFileAsync = promisify(execFile);

async function ssh(cmd) {
  const token = process.env.COOLIFY_API_TOKEN;
  const base = process.env.COOLIFY_API_URL.replace(/\/$/, "");
  const h = { Authorization: `Bearer ${token}` };
  const srv = await fetch(`${base}/api/v1/servers/ray76gl90ckl5iur3fk2zgvt`, { headers: h }).then((r) => r.json());
  const keys = await fetch(`${base}/api/v1/security/keys`, { headers: h }).then((r) => r.json());
  const kid = srv.private_key_uuid || srv.private_key_id;
  const pk = keys.find((k) => k.uuid === kid || k.id === kid)?.private_key;
  const keyPath = join(tmpdir(), `k-${randomBytes(4).toString("hex")}`);
  await writeFile(keyPath, pk, { mode: 0o600 });
  try {
    const { stdout } = await execFileAsync(
      "ssh",
      ["-i", keyPath, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", "-p", String(srv.port || 22), `ubuntu@${srv.ip}`, cmd],
      { timeout: 60_000, maxBuffer: 2 * 1024 * 1024 }
    );
    return stdout;
  } finally {
    await unlink(keyPath).catch(() => undefined);
  }
}

async function main() {
  const py = `
import re
text = open("/home/ubuntu/apps/ecosystem.config.js").read()
for key in sorted(set(re.findall(r"(stripe_[a-z_]+)\\s*:", text))):
    m = re.search(rf"{re.escape(key)}\\s*:\\s*['\\\"]([^'\\\"]+)", text)
    if m:
        print(f"{key}={m.group(1)}")
`;
  const b64 = Buffer.from(py).toString("base64");
  const out = await ssh(`bash -lc 'echo ${b64} | base64 -d | python3'`);
  console.log(out.trim() || "(no stripe keys parsed)");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
