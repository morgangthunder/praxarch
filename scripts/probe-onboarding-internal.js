/** Probe onboarding agent inside staging container (localhost). */
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
  const pk = keys.find((k) => k.uuid === (srv.private_key_uuid || srv.private_key_id))?.private_key;
  const keyPath = join(tmpdir(), `p-${randomBytes(4).toString("hex")}`);
  await writeFile(keyPath, pk, { mode: 0o600 });
  const cmd = [
    "APP=$(docker ps --format '{{.Names}}' | grep '^app-gacc5' | head -1)",
    "echo app=$APP",
    "echo '=== .secret.example LLM section ==='",
    "grep -nE 'LLM|GEMINI|OPENAI|ANTHROPIC|ONBOARDING|MCP' /data/coolify/applications/gacc5qlsha4e9nrqk1vf58b3/Back-end/.secret.example | head -25",
    "echo '=== provider-factory / getStatus ==='",
    "docker exec $APP grep -rn 'configured\\|getStatus\\|ONBOARDING_AGENT' /app/services/llm /app/controllers/onboardingAgent* /app/routes/onboardingAgent* 2>/dev/null | head -30",
    "echo '=== curl inside container ==='",
    "docker exec $APP curl -s http://127.0.0.1:${PORT:-3303}/api/onboarding-agent/status 2>/dev/null | head -c 400",
    "echo",
    "docker exec $APP sh -c 'curl -s http://127.0.0.1:${PORT:-3303}/api/onboarding-agent/status 2>/dev/null' | head -c 400",
    "echo",
    "echo '=== prod agreeatime status (external) ==='",
    "curl -sk https://bubblbook.com/api/onboarding-agent/status 2>/dev/null | head -c 300",
    "echo",
  ].join(" && ");
  try {
    const { stdout } = await execFileAsync(
      "ssh",
      ["-i", keyPath, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", "-p", "22", `ubuntu@${srv.ip}`, cmd],
      { timeout: 90000, maxBuffer: 4 * 1024 * 1024 }
    );
    console.log(stdout);
  } finally {
    await unlink(keyPath).catch(() => undefined);
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
