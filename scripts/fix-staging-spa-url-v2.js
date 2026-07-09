/** Fix corrupted .env and set BUBBLBOOK_SPA_URL for MCP join links. */
const { execFile } = require("child_process");
const { promisify } = require("util");
const { writeFile, unlink } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");
const execFileAsync = promisify(execFile);

const SPA_URL = "https://alpha.bubblbook.com";
const ROOT = "/data/coolify/applications/gacc5qlsha4e9nrqk1vf58b3";

async function ssh(pk, ip, cmd, timeout = 120000) {
  const keyPath = join(tmpdir(), `k-${Date.now()}`);
  await writeFile(keyPath, pk, { mode: 0o600 });
  try {
    const { stdout } = await execFileAsync(
      "ssh",
      ["-i", keyPath, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", `ubuntu@${ip}`, cmd],
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

  const fixEnv = [
    `cd ${ROOT}`,
    "# Fix corrupted HOST line and ensure BUBBLBOOK_SPA_URL is a proper key",
    "sed -i 's/^HOST=0\\.0\\.0\\.0BUBBLBOOK_SPA_URL=.*/HOST=0.0.0.0/' .env",
    "grep -q '^BUBBLBOOK_SPA_URL=' .env && sed -i 's|^BUBBLBOOK_SPA_URL=.*|BUBBLBOOK_SPA_URL=" + SPA_URL + "|' .env || echo 'BUBBLBOOK_SPA_URL=" + SPA_URL + "' >> .env",
    "grep '^HOST=' .env | head -1",
    "grep '^BUBBLBOOK_SPA_URL=' .env | head -1",
  ].join("; ");

  const redeploy = [
    `cd ${ROOT}`,
    "sudo docker compose -f docker-compose.yml -f docker-compose.mcp.yml up -d --force-recreate mcp app",
    "APP=$(docker ps --format '{{.Names}}' | grep '^app-gacc5' | head -1)",
    'MCP_NET=$(docker inspect mcp-server --format "{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}" | awk "{print \\$1}")',
    'APP_NET=$(docker inspect "$APP" --format "{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}" | awk "{print \\$1}")',
    'docker network connect "$MCP_NET" "$APP" 2>/dev/null || true',
    'docker network connect "$APP_NET" mcp-server 2>/dev/null || true',
    "docker exec mcp-server env | grep BUBBLBOOK_SPA_URL",
    "docker exec $APP env | grep BUBBLBOOK_SPA_URL || echo app_spa_not_set",
    "docker exec $APP node -e \"require('http').get('http://mcp:3400/health',r=>console.log('mcp',r.statusCode)).on('error',e=>console.error(e.message))\"",
  ].join("; ");

  console.log("=== fix .env ===");
  console.log(await ssh(pk, srv.ip, fixEnv));
  console.log("=== redeploy ===");
  console.log(await ssh(pk, srv.ip, redeploy));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
