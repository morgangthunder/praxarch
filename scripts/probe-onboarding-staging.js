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
  if (!pk) throw new Error("no key");
  const keyPath = join(tmpdir(), `p-${randomBytes(4).toString("hex")}`);
  await writeFile(keyPath, pk, { mode: 0o600 });
  const cmd = [
    "APP=$(docker ps --format '{{.Names}}' | grep '^app-gacc5' | head -1)",
    "COMPOSE=/data/coolify/applications/gacc5qlsha4e9nrqk1vf58b3/docker-compose.yml",
    "echo '=== coolify dir ==='",
    "ls -la /data/coolify/applications/gacc5qlsha4e9nrqk1vf58b3/ 2>/dev/null | head -25",
    "echo '=== onboarding env in container ==='",
    "docker exec $APP env | grep -iE 'ONBOARDING|MCP|OPENAI|GROK|ANTHROPIC|LLM' | cut -d= -f1 | sort",
    "echo '=== .secret keys (names only) ==='",
    "docker exec $APP sh -c 'test -f /app/.secret && grep -E ^[A-Z] /app/.secret | cut -d= -f1 || test -f Back-end/.secret && grep -E ^[A-Z] Back-end/.secret | cut -d= -f1 || find /app -name .secret -maxdepth 3 2>/dev/null'",
    "echo '=== mcp containers ==='",
    "docker ps -a --format '{{.Names}} {{.Ports}} {{.Status}}' | grep -i mcp || echo none",
    "echo '=== onboarding status ==='",
    "curl -sk -o /dev/null -w 'onboarding_status=%{http_code}\\n' https://alpha.bubblbook.com/api/onboarding-agent/status",
    "curl -sk https://alpha.bubblbook.com/api/onboarding-agent/status 2>/dev/null | head -c 500",
    "echo",
    "echo '=== grep onboarding in server ==='",
    "docker exec $APP grep -rn onboarding /app/routes /app/server.js /app/controllers 2>/dev/null | head -15",
  ].join(" && ");
  try {
    const { stdout } = await execFileAsync("ssh", ["-i", keyPath, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", "-p", "22", `ubuntu@${srv.ip}`, cmd], { timeout: 90000, maxBuffer: 4*1024*1024 });
    console.log(stdout);
  } finally { await unlink(keyPath).catch(() => {}); }
}
main().catch(e => { console.error(e.message); process.exit(1); });
