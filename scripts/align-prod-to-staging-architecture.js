/**
 * Align Bubblbook production EC2 to staging-style bridge Coolify deploy.
 * - Bridge overlay (no host network)
 * - App uses mongo/redis compose DNS; mongo still published on host :27018 for external tools (Sheets)
 * - Full Dockerfile build
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

async function ssh(pk, cmd, timeout = 180000) {
  const keyPath = join(tmpdir(), `align-${Date.now()}.key`);
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
        `ubuntu@${SERVER_IP}`,
        `bash -lc '${cmd.replace(/'/g, "'\\''")}'`,
      ],
      { timeout, maxBuffer: 8 * 1024 * 1024 }
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
  if (!pk) throw new Error("SSH key unavailable");
  return pk;
}

function buildRemoteScript() {
  const overlayB64 = Buffer.from(BRIDGE_OVERLAY).toString("base64");
  return [
    "#!/bin/bash",
    "set -e",
    `cd ${ROOT}`,
    "echo '=== 1. disk prune ==='",
    "sudo docker builder prune -af 2>&1 | tail -3 || true",
    "sudo docker image prune -af 2>&1 | tail -3 || true",
    "df -h / | tail -1",
    "echo '=== 2. bridge overlay ==='",
    `echo '${overlayB64}' | base64 -d > docker-compose.praxarch-build.yml`,
    "cat docker-compose.praxarch-build.yml",
    "echo '=== 3. env files (bridge URIs) ==='",
    "for f in Back-end/.secret .env; do",
    '  [ -f "$f" ] || continue',
    '  sed -i "s|^MONGO_URI=.*|MONGO_URI=mongodb://mongo:27017/bubblbook|" "$f"',
    '  sed -i "s|^REDIS_HOST=.*|REDIS_HOST=redis|" "$f"',
    '  sed -i "s|^REDIS_PORT=.*|REDIS_PORT=6379|" "$f"',
    '  grep -q "^ONBOARDING_AGENT_MCP_URL=" "$f" && sed -i "s|^ONBOARDING_AGENT_MCP_URL=.*|ONBOARDING_AGENT_MCP_URL=http://mcp:3400|" "$f" || echo "ONBOARDING_AGENT_MCP_URL=http://mcp:3400" >> "$f"',
    "done",
    "grep -E '^(MONGO_URI|REDIS_|PORT|ONBOARDING)' Back-end/.secret | sed 's/=.*$/=***/'",
    "echo '=== 4. ensure mongo/redis up ==='",
    "sudo docker compose -f docker-compose.yml up -d mongo redis",
    "echo '=== 5. full build ==='",
    "export DOCKER_BUILDKIT=1",
    "export COMPOSE_DOCKER_CLI_BUILD=1",
    "sudo -E docker compose -f docker-compose.yml -f docker-compose.praxarch-build.yml build --progress=plain app",
    "echo '=== 6. up app + mcp ==='",
    "sudo docker compose -f docker-compose.yml -f docker-compose.praxarch-build.yml -f docker-compose.mcp.yml up -d --force-recreate app mcp",
    "echo '=== 7. MCP network join ==='",
    'APP=$(docker ps --format "{{.Names}}" | grep -E "^app-|work-" | head -1)',
    'MCP_NET=$(docker inspect mcp-server --format "{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}" 2>/dev/null | awk "{print \\$1}")',
    'APP_NET=$(docker inspect "$APP" --format "{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}" 2>/dev/null | awk "{print \\$1}")',
    'test -n "$APP" && test -n "$MCP_NET" && docker network inspect "$MCP_NET" --format "{{range .Containers}}{{.Name}} {{end}}" | grep -q "$APP" || docker network connect "$MCP_NET" "$APP" 2>/dev/null || true',
    'test -n "$APP_NET" && docker network inspect "$APP_NET" --format "{{range .Containers}}{{.Name}} {{end}}" | grep -q mcp-server || docker network connect "$APP_NET" mcp-server 2>/dev/null || true',
    "sleep 10",
    "echo '=== 8. smoke ==='",
    "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'",
    "docker exec mongo-latest mongosh --quiet bubblbook --eval 'print(\"users=\"+db.users.countDocuments())'",
    "curl -sf -o /dev/null -w 'root3300=%{http_code}\\n' http://127.0.0.1:3300/",
    "curl -sf -o /dev/null -w 'agree3300=%{http_code}\\n' http://127.0.0.1:3300/app/g/agreeatime",
    "curl -sk -o /dev/null -w 'https_root=%{http_code}\\n' https://bubblbook.com/",
    "curl -sk -o /dev/null -w 'https_agree=%{http_code}\\n' https://bubblbook.com/app/g/agreeatime",
    "docker run --rm --network host mongo:7 mongosh 'mongodb://127.0.0.1:27018/bubblbook' --quiet --eval 'print(\"ext27018_users=\"+db.users.countDocuments())'",
    `echo OK > ${DONE}`,
  ].join("\n");
}

async function main() {
  const pk = await getSshKey();
  const mode = process.argv[2] || "start";

  if (mode === "poll") {
    const out = await ssh(
      pk,
      `test -f ${DONE} && echo STATUS=done && tail -20 ${LOG} || (echo STATUS=running; tail -25 ${LOG} 2>/dev/null || echo no_log)`,
      60000
    );
    console.log(out);
    return;
  }

  const script = buildRemoteScript();
  const scriptB64 = Buffer.from(script).toString("base64");
  const startCmd = [
    `rm -f ${DONE} ${LOG}`,
    `echo '${scriptB64}' | base64 -d > /tmp/align-prod-staging.sh`,
    "chmod +x /tmp/align-prod-staging.sh",
    `nohup /tmp/align-prod-staging.sh > ${LOG} 2>&1 </dev/null & disown`,
    "sleep 2",
    "echo ALIGN_STARTED",
    `tail -5 ${LOG} 2>/dev/null || true`,
  ].join("; ");

  console.log(await ssh(pk, startCmd, 90000));
  console.log(`Poll with: node scripts/align-prod-to-staging-architecture.js poll`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
