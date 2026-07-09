const { execFile } = require("child_process");
const { promisify } = require("util");
const { writeFile, unlink } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");
const execFileAsync = promisify(execFile);

async function ssh(cmd) {
  const token = process.env.COOLIFY_API_TOKEN;
  const base = (process.env.COOLIFY_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
  const h = { Authorization: `Bearer ${token}` };
  const keys = await fetch(`${base}/api/v1/security/keys`, { headers: h }).then((r) => r.json());
  const pk = keys.find((k) => k.id === 1)?.private_key;
  const kp = join(tmpdir(), `k-${Date.now()}`);
  await writeFile(kp, pk, { mode: 0o600 });
  try {
    const { stdout } = await execFileAsync(
      "ssh",
      ["-i", kp, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", "ubuntu@34.251.139.131", `bash -lc '${cmd.replace(/'/g, "'\\''")}'`],
      { timeout: 120000, maxBuffer: 4 * 1024 * 1024 }
    );
    return stdout;
  } finally {
    await unlink(kp).catch(() => undefined);
  }
}

async function main() {
  const cmd = [
    "echo '=== process 3300 ==='",
    "ps -p 17387 -o args= 2>/dev/null || ps aux | grep 'server.js' | grep -v grep | head -3",
    "echo '=== pm2 ==='",
    "export PATH=$PATH:/home/ubuntu/.nvm/versions/node/v22.15.0/bin:/home/ubuntu/.nvm/versions/node/v17.9.1/bin",
    "pm2 list 2>/dev/null | head -10 || true",
    "echo '=== nginx files ==='",
    "ls /etc/nginx/sites-enabled/ 2>/dev/null; ls /etc/nginx/conf.d/ 2>/dev/null",
    "sudo grep -rn '3300\\|3304\\|bubblbook\\|proxy_pass' /etc/nginx/ 2>/dev/null | head -25",
    "echo '=== curl public ==='",
    "curl -s -o /dev/null -w 'bubblbook.com=%{http_code}\\n' -H 'Host: bubblbook.com' http://127.0.0.1/ || true",
    "curl -s -o /dev/null -w 'direct3300=%{http_code}\\n' http://127.0.0.1:3300/ || true",
    "curl -s -o /dev/null -w 'direct3304=%{http_code}\\n' http://127.0.0.1:3304/ || true",
  ].join("; ");
  console.log(await ssh(cmd));
}
main().catch((e) => { console.error(e.message); process.exit(1); });
