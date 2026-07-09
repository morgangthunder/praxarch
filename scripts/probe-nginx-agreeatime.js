const { execFile } = require("child_process");
const { promisify } = require("util");
const { writeFile, unlink } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");
const { randomBytes } = require("crypto");
const execFileAsync = promisify(execFile);
const SERVER_UUID = "rorxx790bkr8db4ssro9v5fh";

async function main() {
  const token = process.env.COOLIFY_API_TOKEN;
  const base = process.env.COOLIFY_API_URL.replace(/\/$/, "");
  const headers = { Authorization: `Bearer ${token}` };
  const srv = await fetch(`${base}/api/v1/servers/${SERVER_UUID}`, { headers }).then((r) => r.json());
  const keys = await fetch(`${base}/api/v1/security/keys`, { headers }).then((r) => r.json());
  const keyId = srv.private_key_uuid || srv.private_key_id;
  const keyObj = keys.find((k) => k.uuid === keyId || k.id === keyId);
  if (!keyObj?.private_key) throw new Error("SSH key unavailable");
  const keyPath = join(tmpdir(), `probe-${randomBytes(4).toString("hex")}`);
  await writeFile(keyPath, keyObj.private_key, { mode: 0o600 });

  const cmd = [
    "echo '=== nginx sites ==='",
    "ls -la /etc/nginx/sites-enabled/ 2>/dev/null; ls -la /etc/nginx/conf.d/ 2>/dev/null",
    "echo '=== alpha.bubblbook upstream blocks ==='",
    "sudo cat /etc/nginx/sites-enabled/* 2>/dev/null | grep -A3 -B3 -E '3300|3301|3303|agreeatime|/app/g' || cat /etc/nginx/sites-enabled/* 2>/dev/null | grep -A3 -B3 -E '3300|3301|3303|agreeatime|/app/g' || true",
    "echo '=== pm2/listeners 3300 3301 ==='",
    "pm2 list 2>/dev/null | head -15 || true",
    "sudo lsof -i :3300 -i :3301 2>/dev/null | head -10 || (sudo -n ss -tlnp | grep -E ':330[01] ') || true",
    "echo '=== curl via nginx Host header ==='",
    "curl -s -o /dev/null -w 'nginx_root=%{http_code}\\n' -H 'Host: alpha.bubblbook.com' http://127.0.0.1/ 2>/dev/null || true",
    "curl -s -o /dev/null -w 'nginx_agreeatime=%{http_code}\\n' -H 'Host: alpha.bubblbook.com' http://127.0.0.1/app/g/agreeatime 2>/dev/null || true",
    "curl -s -o /dev/null -w 'https_agreeatime=%{http_code}\\n' -k https://alpha.bubblbook.com/app/g/agreeatime 2>/dev/null || true",
  ].join("; ");

  try {
    const { stdout } = await execFileAsync(
      "ssh",
      ["-i", keyPath, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", "-p", String(srv.port || 22), `${srv.user || "root"}@${srv.ip}`, cmd],
      { timeout: 60_000, maxBuffer: 4 * 1024 * 1024 }
    );
    console.log(stdout);
  } finally {
    await unlink(keyPath).catch(() => undefined);
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
