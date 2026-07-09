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
  const keyPath = join(tmpdir(), `p-${randomBytes(4).toString("hex")}`);
  await writeFile(keyPath, pk, { mode: 0o600 });
  const cmd = [
    "APP=$(docker ps --format '{{.Names}}' | grep '^app-gacc5' | head -1)",
    "docker exec $APP find /app/routes -name '*.js' -exec grep -l -i agree {} \\;",
    "docker exec $APP grep -rn agreeatime /app/routes /app/controllers 2>/dev/null | head -25",
    "echo '--- API probes ---'",
    "curl -sk -o /dev/null -w 'api_agree=%{http_code}\\n' https://alpha.bubblbook.com/api/agreeatime",
    "curl -sk -o /dev/null -w 'api_g=%{http_code}\\n' https://alpha.bubblbook.com/api/g/agreeatime",
    "curl -sk -o /dev/null -w 'socket3303=%{http_code}\\n' 'https://alpha.bubblbook.com/socket.io/?EIO=4&transport=polling'",
    "curl -sk -o /dev/null -w 'socket3301=%{http_code}\\n' 'https://alpha.bubblbook.com/1/socket.io/?EIO=4&transport=polling'",
    "docker logs $APP --tail 50 2>&1 | grep -iE '502|agreeatime|error' | tail -15",
  ].join(" && ");
  try {
    const { stdout } = await execFileAsync("ssh", ["-i", keyPath, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", "-p", "22", `ubuntu@${srv.ip}`, cmd], { timeout: 90000 });
    console.log(stdout);
  } finally { await unlink(keyPath).catch(() => {}); }
}
main().catch(e => { console.error(e.message); process.exit(1); });
