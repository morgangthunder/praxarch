/** Read-only: check production for LLM keys (names/lengths only). */
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
      { timeout: 60000, maxBuffer: 2 * 1024 * 1024 }
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
  const srv = await fetch(`${base}/api/v1/servers/ray76gl90ckl5iur3fk2zgvt`, { headers: h }).then((r) => r.json());
  const keys = await fetch(`${base}/api/v1/security/keys`, { headers: h }).then((r) => r.json());
  const kid = srv.private_key_uuid || srv.private_key_id;
  const pk = keys.find((k) => k.uuid === kid || k.id === kid)?.private_key;
  if (!pk) throw new Error("no ssh key");

  const cmd = [
    "echo '=== .secret files ==='",
    "find /home/ubuntu -maxdepth 5 -name '.secret' 2>/dev/null | head -10",
    "for f in $(find /home/ubuntu -maxdepth 5 -name '.secret' 2>/dev/null | head -5); do",
    "  echo \"--- $f ---\"",
    "  grep -E '^(LLM_PROVIDER|GEMINI|GOOGLE_API|OPENAI|ANTHROPIC|ONBOARDING)=' \"$f\" | while IFS='=' read -r k v; do echo \"  $k len=${#v}\"; done",
    "done",
    "echo '=== pm2 env (first process) ==='",
    "pm2 env 0 2>/dev/null | grep -E '^(LLM_PROVIDER|GEMINI|GOOGLE_API|OPENAI|ANTHROPIC|ONBOARDING)=' | while IFS='=' read -r k v; do echo \"  $k len=${#v}\"; done || echo '  (pm2 env unavailable)'",
  ].join("\n");

  console.log(await ssh(pk, srv.ip, cmd));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
