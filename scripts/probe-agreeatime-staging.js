/**
 * Read-only staging probe: nginx routes, published ports, agreeatime upstream health.
 */
const { execFile } = require("child_process");
const { promisify } = require("util");
const { writeFile, unlink } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");
const { randomBytes } = require("crypto");

const execFileAsync = promisify(execFile);
const SERVER_UUID = "rorxx790bkr8db4ssro9v5fh";

async function ssh(privateKey, srv, command) {
  const keyPath = join(tmpdir(), `probe-${randomBytes(4).toString("hex")}`);
  await writeFile(keyPath, privateKey, { mode: 0o600 });
  try {
    const { stdout, stderr } = await execFileAsync(
      "ssh",
      [
        "-i",
        keyPath,
        "-o",
        "BatchMode=yes",
        "-o",
        "StrictHostKeyChecking=accept-new",
        "-o",
        "UserKnownHostsFile=/dev/null",
        "-p",
        String(srv.port || 22),
        `${srv.user || "root"}@${srv.ip}`,
        command,
      ],
      { timeout: 60_000, maxBuffer: 4 * 1024 * 1024 }
    );
    return stdout || stderr;
  } finally {
    await unlink(keyPath).catch(() => undefined);
  }
}

async function main() {
  const token = process.env.COOLIFY_API_TOKEN;
  const base = process.env.COOLIFY_API_URL.replace(/\/$/, "");
  const headers = { Authorization: `Bearer ${token}` };
  const srv = await fetch(`${base}/api/v1/servers/${SERVER_UUID}`, { headers }).then((r) => r.json());
  const keys = await fetch(`${base}/api/v1/security/keys`, { headers }).then((r) => r.json());
  const keyId = srv.private_key_uuid || srv.private_key_id;
  const keyObj = keys.find((k) => k.uuid === keyId || k.id === keyId);
  const privateKey = keyObj?.private_key;
  if (!privateKey) throw new Error("SSH key unavailable");

  const cmd = [
    "echo '=== NGINX agreeatime ==='",
    "sudo grep -r agreeatime /etc/nginx/ 2>/dev/null | head -30 || grep -r agreeatime /etc/nginx/ 2>/dev/null | head -30 || true",
    "echo '=== NGINX location /app/g ==='",
    "sudo grep -r '/app/g' /etc/nginx/ 2>/dev/null | head -20 || true",
    "echo '=== DOCKER ps (coolify bubblbook) ==='",
    "docker ps -a --format 'table {{.Names}}\\t{{.Ports}}\\t{{.Status}}' | grep -E 'gacc5qlsha4e9nrqk1vf58b3|agreeatime|NAME' || docker ps -a --format 'table {{.Names}}\\t{{.Ports}}\\t{{.Status}}' | head -20",
    "echo '=== ss listeners 3300-3310 ==='",
    "(sudo -n ss -tlnp 2>/dev/null || ss -tlnp) | grep -E ':330[0-9] ' || true",
    "echo '=== curl probes ==='",
    "for p in 3303 3304 3305 3306 3307; do c=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$p/app/g/agreeatime 2>/dev/null || echo 000); echo port_$p=/app/g/agreeatime=$c; done",
    "for p in 3303 3304 3305 3306 3307; do c=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$p/ 2>/dev/null || echo 000); echo port_$p=/=$c; done",
  ].join("; ");

  console.log(await ssh(privateKey, srv, cmd));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
