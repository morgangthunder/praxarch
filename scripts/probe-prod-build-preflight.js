/** Quick prod preflight: disk + coolify app dir */
const { execFile } = require("child_process");
const { promisify } = require("util");
const { writeFile, unlink } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");
const { randomBytes } = require("crypto");
const execFileAsync = promisify(execFile);
const SERVER = "ray76gl90ckl5iur3fk2zgvt";
const APP = "nf6adysipbutbwzslufhhoqg";

async function main() {
  const token = process.env.COOLIFY_API_TOKEN;
  const base = process.env.COOLIFY_API_URL.replace(/\/$/, "");
  const h = { Authorization: `Bearer ${token}` };
  const srv = await fetch(`${base}/api/v1/servers/${SERVER}`, { headers: h }).then((r) => r.json());
  const keys = await fetch(`${base}/api/v1/security/keys`, { headers: h }).then((r) => r.json());
  const pk = keys.find((k) => k.uuid === (srv.private_key_uuid || srv.private_key_id))?.private_key;
  const kp = join(tmpdir(), `k-${randomBytes(4).toString("hex")}`);
  await writeFile(kp, pk, { mode: 0o600 });
  const root = `/data/coolify/applications/${APP}`;
  const cmd = `bash -lc 'df -h / | tail -1; echo ---; ls -la ${root} 2>/dev/null | head -15; echo ---; docker ps --format "{{.Names}}" | head -10; echo ---; test -d /home/ubuntu/apps/master/bubbl_book/Back-end/public && du -sh /home/ubuntu/apps/master/bubbl_book/Back-end/public || echo no-pm2-public'`;
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
