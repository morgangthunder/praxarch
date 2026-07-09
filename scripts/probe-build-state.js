const { execFile } = require("child_process");
const { promisify } = require("util");
const { writeFile, unlink } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");
const execFileAsync = promisify(execFile);

async function main() {
  const token = process.env.COOLIFY_API_TOKEN;
  const base = process.env.COOLIFY_API_URL.replace(/\/$/, "");
  const h = { Authorization: `Bearer ${token}` };
  const srv = await fetch(`${base}/api/v1/servers/rorxx790bkr8db4ssro9v5fh`, { headers: h }).then((r) => r.json());
  const keys = await fetch(`${base}/api/v1/security/keys`, { headers: h }).then((r) => r.json());
  const kid = srv.private_key_uuid || srv.private_key_id;
  const pk = keys.find((k) => k.uuid === kid || k.id === kid)?.private_key;
  const keyPath = join(tmpdir(), "k");
  await writeFile(keyPath, pk, { mode: 0o600 });
  const cmd = [
    "test -f /tmp/bubblbook-staging-build.done && echo BUILD_DONE || echo BUILD_PENDING",
    "tail -5 /tmp/bubblbook-staging-build.log 2>/dev/null || echo no_log",
    "pgrep -af 'docker compose.*build' || echo no_build_process",
    "docker images | grep -E 'praxarch-local|bubblbook-staging' | head -3",
  ].join(" && ");
  const { stdout } = await execFileAsync(
    "ssh",
    ["-i", keyPath, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", `ubuntu@${srv.ip}`, cmd],
    { timeout: 30000 }
  );
  console.log(stdout);
  await unlink(keyPath);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
