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
  const h = { Authorization: `Bearer ${token}` };
  const srv = await fetch(`${base}/api/v1/servers/rorxx790bkr8db4ssro9v5fh`, { headers: h }).then((r) => r.json());
  const keys = await fetch(`${base}/api/v1/security/keys`, { headers: h }).then((r) => r.json());
  const kid = srv.private_key_uuid || srv.private_key_id;
  const pk = keys.find((k) => k.uuid === kid || k.id === kid)?.private_key;
  if (!pk) throw new Error("SSH key unavailable");
  const keyPath = join(tmpdir(), `p-${randomBytes(4).toString("hex")}`);
  await writeFile(keyPath, pk, { mode: 0o600 });
  const cmd = [
    "echo '=== ports 3300-3305 ==='",
    "(sudo -n ss -tlnp || ss -tlnp) | grep -E ':330[0-5] '",
    "for p in 3300 3301 3302 3303; do echo -n port_$p=; curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$p/ 2>/dev/null || echo down; echo; done",
    "echo '=== nginx /2 path ==='",
    "curl -sk -o /dev/null -w '/2=%{http_code}\\n' https://alpha.bubblbook.com/2/",
    "curl -sk -o /dev/null -w '/2/agree=%{http_code}\\n' https://alpha.bubblbook.com/2/app/g/agreeatime",
    "curl -sk -o /dev/null -w '/1/agree=%{http_code}\\n' https://alpha.bubblbook.com/1/app/g/agreeatime",
  ].join("; ");
  try {
    const { stdout } = await execFileAsync("ssh", ["-i", keyPath, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", "-p", "22", `ubuntu@${srv.ip}`, cmd], { timeout: 60000 });
    console.log(stdout);
  } finally { await unlink(keyPath).catch(() => {}); }
}
main().catch(e => { console.error(e.message); process.exit(1); });
