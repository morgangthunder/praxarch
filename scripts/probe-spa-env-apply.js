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
    `grep BUBBLBOOK_SPA ${root}/.env || echo missing_in_env`,
    `grep -A5 BUBBLBOOK_SPA ${root}/docker-compose.mcp.yml`,
    "docker inspect mcp-server --format '{{range .Config.Env}}{{println .}}{{end}}' | grep SPA",
    `cd ${root} && docker compose -f docker-compose.yml -f docker-compose.mcp.yml config 2>/dev/null | grep -A2 BUBBLBOOK_SPA || true`,
  ].join("; ");
  const { stdout } = await execFileAsync("ssh", ["-i", keyPath, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", `ubuntu@${srv.ip}`, cmd], { timeout: 60000 });
  console.log(stdout);
  await unlink(keyPath);
}
main().catch(e => { console.error(e.message); process.exit(1); });
