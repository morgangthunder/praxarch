const { execFile } = require("child_process");
const { promisify } = require("util");
const { writeFile, unlink } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");
const execFileAsync = promisify(execFile);

async function main() {
  const token = process.env.COOLIFY_API_TOKEN;
  const base = (process.env.COOLIFY_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
  const h = { Authorization: `Bearer ${token}` };
  const keys = await fetch(`${base}/api/v1/security/keys`, { headers: h }).then((r) => r.json());
  const pk = keys.find((k) => k.id === 1)?.private_key;
  const kp = join(tmpdir(), `k-${Date.now()}`);
  await writeFile(kp, pk, { mode: 0o600 });
  const cmd = [
    "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'",
    "APP=$(docker ps --format '{{.Names}}' | grep '^work-' | head -1)",
    'MCP_NET=$(docker inspect mcp-server --format "{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}" | awk "{print \\$1}")',
    'APP_NET=$(docker inspect "$APP" --format "{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}" | awk "{print \\$1}")',
    'echo app=$APP mcp_net=$MCP_NET app_net=$APP_NET',
    'docker network inspect "$MCP_NET" --format "{{range .Containers}}{{.Name}} {{end}}" | grep -q "$APP" || docker network connect "$MCP_NET" "$APP"',
    'docker network inspect "$APP_NET" --format "{{range .Containers}}{{.Name}} {{end}}" | grep -q mcp-server || docker network connect "$APP_NET" mcp-server',
    "sleep 5",
    "curl -s -o /dev/null -w 'health=%{http_code}\\n' http://127.0.0.1:3300/ || true",
    "curl -s http://127.0.0.1:3300/api/onboarding-agent/status 2>/dev/null | head -c 200 || true",
    "echo",
  ].join("; ");
  try {
    const { stdout } = await execFileAsync(
      "ssh",
      ["-i", kp, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", "ubuntu@34.251.139.131", `bash -lc '${cmd.replace(/'/g, "'\\''")}'`],
      { timeout: 120000, maxBuffer: 2 * 1024 * 1024 }
    );
    console.log(stdout);
  } finally {
    await unlink(kp).catch(() => undefined);
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
