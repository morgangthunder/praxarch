/** Fix app<->mcp Docker network isolation on staging. */
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
      ["-i", keyPath, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", "-o", "ConnectTimeout=20", `ubuntu@${ip}`, cmd],
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

  const cmd = [
    "APP=$(docker ps --format '{{.Names}}' | grep '^app-gacc5' | head -1)",
    "MCP_NET=$(docker inspect mcp-server --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' | awk '{print $1}')",
    "APP_NET=$(docker inspect $APP --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' | awk '{print $1}')",
    "echo app=$APP app_net=$APP_NET mcp_net=$MCP_NET",
    "# Connect app to MCP network so http://mcp:3400 resolves",
    "docker network inspect $MCP_NET --format '{{range .Containers}}{{.Name}} {{end}}' | grep -q \"$APP\" || docker network connect $MCP_NET $APP",
    "# Connect mcp to app network so http://app:3303 resolves for MCP callbacks",
    "docker network inspect $APP_NET --format '{{range .Containers}}{{.Name}} {{end}}' | grep -q mcp-server || docker network connect $APP_NET mcp-server",
    "echo '=== verify DNS from app ==='",
    "docker exec $APP node -e \"require('http').get('http://mcp:3400/health',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>console.log(r.statusCode,d))}).on('error',e=>console.error('ERR',e.message))\"",
    "echo '=== verify MCP -> app ==='",
    "docker exec mcp-server node -e \"require('http').get('http://app:3303/api/onboarding-agent/status',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>console.log(r.statusCode,d.slice(0,120)))}).on('error',e=>console.error('ERR',e.message))\" 2>&1 || true",
  ].join("; ");

  console.log(await ssh(pk, srv.ip, cmd));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
