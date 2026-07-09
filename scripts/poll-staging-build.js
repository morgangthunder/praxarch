/** Poll staging source build progress. */
const { execFile } = require("child_process");
const { promisify } = require("util");
const { writeFile, unlink } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");
const execFileAsync = promisify(execFile);

async function ssh(pk, ip, cmd, timeout = 90000) {
  const keyPath = join(tmpdir(), `p-${Date.now()}`);
  await writeFile(keyPath, pk, { mode: 0o600 });
  try {
    const { stdout } = await execFileAsync(
      "ssh",
      ["-i", keyPath, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", "-o", "ConnectTimeout=30", "-o", "ServerAliveInterval=10", `ubuntu@${ip}`, cmd],
      { timeout, maxBuffer: 4 * 1024 * 1024 }
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
  const ip = srv.ip;

  const cmd = [
    "test -f /tmp/bubblbook-staging-build.done && echo STATUS=DONE || echo STATUS=RUNNING",
    "test -f /tmp/praxarch-build-gacc5qlsha4e9nrqk1vf58b3.done && echo PRAXARCH_DONE=yes || echo PRAXARCH_DONE=no",
    "pgrep -af 'rebuild-staging|docker compose.*build' | head -3 || echo no_build_proc",
    "df -h / | tail -1",
    "tail -12 /tmp/bubblbook-staging-build.log 2>/dev/null || tail -12 /tmp/praxarch-build-gacc5qlsha4e9nrqk1vf58b3.log 2>/dev/null || echo no_log",
  ].join("; ");

  console.log(await ssh(pk, ip, cmd));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
