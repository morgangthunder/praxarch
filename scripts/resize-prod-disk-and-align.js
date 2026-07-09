/**
 * 1) Grow filesystem after EBS volume resize
 * 2) Prune build cache
 * 3) Start bridge alignment build (async)
 */
const { execFile } = require("child_process");
const { promisify } = require("util");
const { writeFile, unlink } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");
const execFileAsync = promisify(execFile);

const SERVER_IP = "34.251.139.131";
const PROD_SERVER_UUID = "ray76gl90ckl5iur3fk2zgvt";
const ROOT = "/data/coolify/applications/nf6adysipbutbwzslufhhoqg";
const LOG = "/tmp/bubblbook-prod-align.log";
const DONE = "/tmp/bubblbook-prod-align.done";

const BRIDGE_OVERLAY = `services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    image: praxarch-local-app:latest
`;

async function ssh(pk, cmd, timeout = 300000) {
  const keyPath = join(tmpdir(), `resize-${Date.now()}.key`);
  await writeFile(keyPath, pk, { mode: 0o600 });
  try {
    const { stdout, stderr } = await execFileAsync(
      "ssh",
      [
        "-i",
        keyPath,
        "-o",
        "BatchMode=yes",
        "-o",
        "StrictHostKeyChecking=accept-new",
        "-o",
        "UserKnownHostsFile=/dev/null",
        "-o",
        "ConnectTimeout=30",
        "-o",
        "ServerAliveInterval=30",
        `ubuntu@${SERVER_IP}`,
        `bash -lc '${cmd.replace(/'/g, "'\\''")}'`,
      ],
      { timeout, maxBuffer: 12 * 1024 * 1024 }
    );
    return (stdout || "") + (stderr || "");
  } finally {
    await unlink(keyPath).catch(() => undefined);
  }
}

async function getSshKey() {
  const token = process.env.COOLIFY_API_TOKEN;
  const base = (process.env.COOLIFY_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
  const h = { Authorization: `Bearer ${token}` };
  const srv = await fetch(`${base}/api/v1/servers/${PROD_SERVER_UUID}`, { headers: h }).then((r) => r.json());
  const keys = await fetch(`${base}/api/v1/security/keys`, { headers: h }).then((r) => r.json());
  const kid = srv.private_key_uuid || srv.private_key_id;
  const pk = keys.find((k) => k.uuid === kid || k.id === kid)?.private_key;
  if (!pk) throw new Error("SSH key unavailable from Coolify");
  return pk;
}

function buildAlignScript() {
  const overlayB64 = Buffer.from(BRIDGE_OVERLAY).toString("base64");
  return [
    "#!/bin/bash",
    "set -e",
    `cd ${ROOT}`,
    "echo '=== bridge overlay ==='",
    `echo '${overlayB64}' | base64 -d > docker-compose.praxarch-build.yml`,
    "echo '=== env (bridge URIs) ==='",
    "for f in Back-end/.secret .env; do",
    '  [ -f "$f" ] || continue',
    '  sed -i "s|^MONGO_URI=.*|MONGO_URI=mongodb://mongo:27017/bubblbook|" "$f"',
    '  sed -i "s|^REDIS_HOST=.*|REDIS_HOST=redis|" "$f"',
    '  sed -i "s|^REDIS_PORT=.*|REDIS_PORT=6379|" "$f"',
    '  grep -q "^ONBOARDING_AGENT_MCP_URL=" "$f" && sed -i "s|^ONBOARDING_AGENT_MCP_URL=.*|ONBOARDING_AGENT_MCP_URL=http://mcp:3400|" "$f" || echo "ONBOARDING_AGENT_MCP_URL=http://mcp:3400" >> "$f"',
    "done",
    "grep -E '^(MONGO_URI|REDIS_|ONBOARDING)' Back-end/.secret | sed 's/=.*$/=***/'",
    "sudo docker compose -f docker-compose.yml up -d mongo redis",
    "export DOCKER_BUILDKIT=1",
    "sudo -E docker compose -f docker-compose.yml -f docker-compose.praxarch-build.yml build --progress=plain app",
    "sudo docker compose -f docker-compose.yml -f docker-compose.praxarch-build.yml -f docker-compose.mcp.yml up -d --force-recreate app mcp",
    'APP=$(docker ps --format "{{.Names}}" | grep -E "^app-|work-" | head -1)',
    'MCP_NET=$(docker inspect mcp-server --format "{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}" 2>/dev/null | awk "{print \\$1}")',
    'APP_NET=$(docker inspect "$APP" --format "{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}" 2>/dev/null | awk "{print \\$1}")',
    'test -n "$APP" && test -n "$MCP_NET" && docker network inspect "$MCP_NET" --format "{{range .Containers}}{{.Name}} {{end}}" | grep -q "$APP" || docker network connect "$MCP_NET" "$APP" 2>/dev/null || true',
    'test -n "$APP_NET" && docker network inspect "$APP_NET" --format "{{range .Containers}}{{.Name}} {{end}}" | grep -q mcp-server || docker network connect "$APP_NET" mcp-server 2>/dev/null || true',
    "sleep 12",
    "docker exec mongo-latest mongosh --quiet bubblbook --eval 'print(\"users=\"+db.users.countDocuments())'",
    "curl -sf -o /dev/null -w 'root=%{http_code}\\n' http://127.0.0.1:3300/",
    "curl -sf -o /dev/null -w 'agree=%{http_code}\\n' http://127.0.0.1:3300/app/g/agreeatime",
    "curl -sk -o /dev/null -w 'https=%{http_code}\\n' https://bubblbook.com/",
    `echo OK > ${DONE}`,
  ].join("\n");
}

async function main() {
  const mode = process.argv[2] || "all";
  const pk = await getSshKey();

  if (mode === "poll") {
    console.log(await ssh(pk, `test -f ${DONE} && echo DONE || echo RUNNING; df -h / | tail -1; tail -20 ${LOG} 2>/dev/null || echo no_log`, 120000));
    return;
  }

  if (mode === "resize-only") {
    const resize = [
      "echo '=== before resize ==='",
      "lsblk; df -h / | tail -1",
      "sudo growpart /dev/xvda 1 || true",
      "sudo resize2fs /dev/xvda1 || true",
      "echo '=== after resize ==='",
      "df -h / | tail -1",
    ].join("; ");
    console.log(await ssh(pk, resize, 120000));
    return;
  }

  // Step 1: resize filesystem
  console.log("=== RESIZE FILESYSTEM ===");
  const resizeOut = await ssh(
    pk,
    [
      "echo '=== before ==='",
      "lsblk; df -h / | tail -1",
      "sudo growpart /dev/xvda 1",
      "sudo resize2fs /dev/xvda1",
      "echo '=== after ==='",
      "df -h / | tail -1",
      "sudo docker builder prune -af 2>&1 | tail -2 || true",
      "df -h / | tail -1",
    ].join("; "),
    120000
  );
  console.log(resizeOut);

  if (mode === "resize") return;

  // Step 2: kick alignment build in background
  console.log("\n=== START ALIGNMENT BUILD (background) ===");
  const alignScript = buildAlignScript();
  const b64 = Buffer.from(alignScript).toString("base64");
  const start = [
    `rm -f ${DONE} ${LOG}`,
    `echo '${b64}' | base64 -d > /tmp/align-prod-bridge.sh`,
    "chmod +x /tmp/align-prod-bridge.sh",
    `nohup /tmp/align-prod-bridge.sh > ${LOG} 2>&1 </dev/null & disown`,
    "sleep 2",
    "echo ALIGN_STARTED",
    `tail -5 ${LOG} 2>/dev/null || true`,
  ].join("; ");
  console.log(await ssh(pk, start, 90000));
  console.log("\nPoll: node resize-prod-disk-and-align.js poll");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
