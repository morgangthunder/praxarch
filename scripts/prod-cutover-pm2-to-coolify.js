/**
 * Production cutover: stop PM2 on 3300, move Coolify app to 3300, join MCP network, smoke test.
 */
const { execFile } = require("child_process");
const { promisify } = require("util");
const { writeFile, unlink } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");
const execFileAsync = promisify(execFile);

const ROOT = "/data/coolify/applications/nf6adysipbutbwzslufhhoqg";

async function ssh(cmd, timeout = 180000) {
  const token = process.env.COOLIFY_API_TOKEN;
  const base = (process.env.COOLIFY_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
  const h = { Authorization: `Bearer ${token}` };
  const keys = await fetch(`${base}/api/v1/security/keys`, { headers: h }).then((r) => r.json());
  const pk = keys.find((k) => k.id === 1)?.private_key;
  if (!pk) throw new Error("SSH key not found");
  const kp = join(tmpdir(), `cutover-${Date.now()}`);
  await writeFile(kp, pk, { mode: 0o600 });
  try {
    const { stdout, stderr } = await execFileAsync(
      "ssh",
      ["-i", kp, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", "ubuntu@34.251.139.131", `bash -lc '${cmd.replace(/'/g, "'\\''")}'`],
      { timeout, maxBuffer: 4 * 1024 * 1024 }
    );
    return (stdout || "") + (stderr || "");
  } finally {
    await unlink(kp).catch(() => undefined);
  }
}

async function main() {
  const script = [
    "#!/bin/bash",
    "set -e",
    "export PATH=$PATH:/home/ubuntu/.nvm/versions/node/v22.15.0/bin:/home/ubuntu/.nvm/versions/node/v17.9.1/bin",
    "echo '=== 1. Stop PM2 legacy app ==='",
    "pm2 stop app 2>/dev/null || true",
    "pm2 delete app 2>/dev/null || true",
    "sleep 2",
    "if ss -tlnp | grep -q ':3300 '; then",
    "  echo 'WARN: 3300 still in use — killing listener'",
    "  sudo fuser -k 3300/tcp 2>/dev/null || true",
    "  sleep 2",
    "fi",
    "ss -tlnp | grep 3300 || echo '3300 free'",
    "echo '=== 2. Move Docker app to 3300 ==='",
    `cd ${ROOT}`,
    "sed -i 's/3304:3300/3300:3300/g' docker-compose.yml",
    "grep 'ports:' -A1 docker-compose.yml | head -4",
    "sudo docker compose -f docker-compose.yml -f docker-compose.praxarch-build.yml -f docker-compose.mcp.yml up -d app mcp",
    "echo '=== 3. MCP network join ==='",
    'APP=$(docker ps --format "{{.Names}}" | grep "^work-" | head -1)',
    'MCP_NET=$(docker inspect mcp-server --format "{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}" | awk "{print \\$1}")',
    'APP_NET=$(docker inspect "$APP" --format "{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}" | awk "{print \\$1}")',
    'docker network inspect "$MCP_NET" --format "{{range .Containers}}{{.Name}} {{end}}" | grep -q "$APP" || docker network connect "$MCP_NET" "$APP"',
    'docker network inspect "$APP_NET" --format "{{range .Containers}}{{.Name}} {{end}}" | grep -q mcp-server || docker network connect "$APP_NET" mcp-server',
    "sleep 6",
    "echo '=== 4. Smoke tests ==='",
    "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | head -6",
    "curl -s -o /dev/null -w 'direct3300=%{http_code}\\n' http://127.0.0.1:3300/",
    "curl -s -o /dev/null -w 'nginx_https=%{http_code}\\n' -k https://127.0.0.1/ -H 'Host: bubblbook.com'",
    "curl -s http://127.0.0.1:3300/api/onboarding-agent/status 2>/dev/null | head -c 120 || true",
    "echo",
    "pm2 save 2>/dev/null || true",
    "echo CUTOVER_DONE",
  ].join("\n");

  const out = await ssh(`echo ${Buffer.from(script).toString("base64")} | base64 -d | bash`);
  console.log(out);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
