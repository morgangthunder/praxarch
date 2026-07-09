/** Find backend port and onboarding status JSON inside staging container. */
const { execFile } = require("child_process");
const { promisify } = require("util");
const { writeFile, unlink } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");
const { randomBytes } = require("crypto");
const execFileAsync = promisify(execFile);

async function ssh(pk, ip, cmd) {
  const keyPath = join(tmpdir(), `p-${randomBytes(4).toString("hex")}`);
  await writeFile(keyPath, pk, { mode: 0o600 });
  try {
    const { stdout } = await execFileAsync(
      "ssh",
      ["-i", keyPath, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", "-p", "22", `ubuntu@${ip}`, cmd],
      { timeout: 120000, maxBuffer: 4 * 1024 * 1024 }
    );
    return stdout;
  } finally {
    await unlink(keyPath).catch(() => undefined);
  }
}

async function main() {
  const token = process.env.COOLIFY_API_TOKEN;
  const base = process.env.COOLIFY_API_URL.replace(/\/$/, "");
  const h = { Authorization: `Bearer ${token}` };
  const srv = await fetch(`${base}/api/v1/servers/rorxx790bkr8db4ssro9v5fh`, { headers: h }).then((r) => r.json());
  const keys = await fetch(`${base}/api/v1/security/keys`, { headers: h }).then((r) => r.json());
  const kid = srv.private_key_uuid || srv.private_key_id;
  const pk = keys.find((k) => k.uuid === kid || k.id === kid)?.private_key;

  const cmd = [
    "APP=$(docker ps --format '{{.Names}}' | grep '^app-gacc5' | head -1)",
    "echo '=== listen ports in container ==='",
    "docker exec $APP sh -c 'ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null' | head -15",
    "echo '=== server.js PORT ==='",
    "docker exec $APP sh -c 'echo PORT=$PORT; grep -n listen /app/server.js 2>/dev/null | head -5'",
    "echo '=== gemini env ==='",
    "docker exec $APP sh -c 'test -n \"$GEMINI_API_KEY\" && echo GEMINI_API_KEY=len_${#GEMINI_API_KEY} || echo GEMINI_API_KEY=MISSING'",
    "echo '=== try status paths ==='",
    "for p in 3000 3303 8080; do echo port_$p; docker exec $APP wget -qO- --header='Accept: application/json' http://127.0.0.1:$p/api/onboarding-agent/status 2>/dev/null | head -c 200; echo; done",
    "echo '=== external /2 path ==='",
    "curl -sk -H 'Accept: application/json' https://alpha.bubblbook.com/2/api/onboarding-agent/status | head -c 300",
    "echo",
  ].join(" && ");

  console.log(await ssh(pk, srv.ip, cmd));
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
