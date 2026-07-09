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
  const root = "/data/coolify/applications/gacc5qlsha4e9nrqk1vf58b3";
  const cmd = [
    "APP=$(docker ps --format '{{.Names}}' | grep '^app-gacc5' | head -1)",
    "echo '=== app URL env ==='",
    "docker exec $APP env | grep -iE 'baseURL|SPA_URL|PUBLIC_URL|DEPLOY_URL|FRONTEND|DOMAIN|alpha' | sort",
    "echo '=== mcp URL env ==='",
    "docker exec mcp-server env | grep -iE 'SPA_URL|PUBLIC_URL|DOMAIN|API_URL|alpha|localhost' | sort",
    "echo '=== coolify .env (names only) ==='",
    "grep -iE 'baseURL|SPA_URL|PUBLIC_URL|BUBBLBOOK' $root/.env 2>/dev/null | cut -d= -f1 | sort",
    "echo '=== grep link builder in repo ==='",
    `grep -rn 'localhost:4200\\|BUBBLBOOK_SPA\\|MCP_PUBLIC\\|baseURL' ${root}/mcp-server ${root}/Back-end/services/llm 2>/dev/null | head -25`,
  ].join(" && ");
  const { stdout } = await execFileAsync("ssh", ["-i", keyPath, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", `ubuntu@${srv.ip}`, cmd], { timeout: 90000, maxBuffer: 4*1024*1024 });
  console.log(stdout);
  await unlink(keyPath);
}
main().catch(e => { console.error(e.message); process.exit(1); });
