/** Diagnose MCP link generation on staging. */
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
      { timeout, maxBuffer: 8 * 1024 * 1024 }
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
    "echo app=$APP",
    "echo '=== mcp containers ==='",
    "docker ps -a --format '{{.Names}} {{.Status}} {{.Ports}}' | grep -i mcp || echo none",
    "echo '=== app env MCP ==='",
    "docker exec $APP env | grep -iE 'MCP|ONBOARDING' | sort",
    "echo '=== app -> mcp DNS ==='",
    "docker exec $APP sh -c 'getent hosts mcp 2>/dev/null || nslookup mcp 2>/dev/null || ping -c1 mcp 2>&1 | head -2'",
    "echo '=== curl from app to mcp ==='",
    "docker exec $APP sh -c 'wget -qO- --timeout=5 http://mcp:3400/health 2>&1 || curl -s --connect-timeout 5 http://mcp:3400/health 2>&1 || curl -s --connect-timeout 5 http://127.0.0.1:3400/health 2>&1 || echo all_failed'",
    "docker exec $APP sh -c 'wget -qO- --timeout=5 http://mcp-server:3400/health 2>&1 || curl -s --connect-timeout 5 http://mcp-server:3400/health 2>&1 || echo mcp_server_failed'",
    "echo '=== host curl mcp ==='",
    "curl -s --connect-timeout 3 http://127.0.0.1:3400/health || echo host_3400_fail",
    "echo '=== mcp logs ==='",
    "docker logs mcp-server --tail 25 2>&1",
    "echo '=== app logs mcp/onboarding ==='",
    "docker logs $APP 2>&1 | grep -iE 'mcp|onboarding|createLink|create-link|link' | tail -20",
    "echo '=== docker networks for app/mcp ==='",
    "docker inspect $APP --format '{{json .NetworkSettings.Networks}}' 2>/dev/null | head -c 800",
    "echo",
    "docker inspect mcp-server --format '{{json .NetworkSettings.Networks}}' 2>/dev/null | head -c 800",
    "echo",
    "echo '=== compose mcp service ==='",
    "grep -A30 'mcp' /data/coolify/applications/gacc5qlsha4e9nrqk1vf58b3/docker-compose.mcp.yml 2>/dev/null | head -35",
  ].join(" && ");

  console.log(await ssh(pk, srv.ip, cmd));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
