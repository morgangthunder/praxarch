/**
 * Read-only production preflight: mongo, nginx/agreeatime, containers, external exposure.
 */
const { execFile } = require("child_process");
const { promisify } = require("util");
const { writeFile, unlink } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");
const execFileAsync = promisify(execFile);

const SERVER_IP = "34.251.139.131";
const PROD_SERVER_UUID = "ray76gl90ckl5iur3fk2zgvt";
const PROD_APP_UUID = "nf6adysipbutbwzslufhhoqg";
const ROOT = `/data/coolify/applications/${PROD_APP_UUID}`;

async function ssh(pk, cmd, timeout = 180000) {
  const keyPath = join(tmpdir(), `probe-prod-${Date.now()}.key`);
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
        "ConnectTimeout=25",
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
  if (!pk) throw new Error("SSH key unavailable from Coolify");
  return pk;
}

async function main() {
  const pk = await getSshKey();
  const script = [
    "#!/bin/bash",
    "set +e",
    `echo "=== SERVER ${SERVER_IP} app ${PROD_APP_UUID} ==="`,
    "echo '=== disk ==='",
    "df -h / | tail -1",
    "echo '=== pm2 ==='",
    "export PATH=$PATH:/home/ubuntu/.nvm/versions/node/v22.15.0/bin",
    "pm2 list 2>/dev/null | head -8 || echo no_pm2",
    "echo '=== listeners 3300-3304 27017 27018 6378 ==='",
    "ss -tlnp 2>/dev/null | grep -E ':330[0-4] |:2701[78] |:6378 ' || true",
    "echo '=== docker ps ==='",
    "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'",
    "echo '=== mongo bind / published ==='",
    "grep -E 'bindIp|port' /etc/mongod.conf 2>/dev/null | head -6 || true",
    "docker port mongo-latest 2>/dev/null || true",
    "echo '=== mongo counts host 27017 ==='",
    "mongosh 'mongodb://bbadmin:hdfhn7dbDkgnHyH@127.0.0.1:27017/bubblbook?authSource=admin' --quiet --eval 'printjson({users:db.users.countDocuments(),activities:db.activities.countDocuments(),hubs:db.hubs.countDocuments()})' 2>&1 | tail -3",
    "echo '=== mongo counts docker mongo-latest ==='",
    "docker exec mongo-latest mongosh --quiet bubblbook --eval 'printjson({users:db.users.countDocuments(),activities:db.activities.countDocuments(),hubs:db.hubs.countDocuments()})' 2>&1 | tail -3",
    "echo '=== remote 52.208.203.249 ==='",
    "docker run --rm mongo:7 mongosh 'mongodb://alphabbadmin:test@52.208.203.249/bubblbook' --quiet --eval 'printjson({users:db.users.countDocuments(),activities:db.activities.countDocuments()})' 2>&1 | tail -4",
    "echo '=== app env (redacted) ==='",
    `APP=$(docker ps --format '{{.Names}}' | grep -E '^(work-|app-${PROD_APP_UUID.slice(0, 12)})' | head -1)`,
    'echo app_container=$APP',
    'if [ -n "$APP" ]; then docker exec "$APP" printenv MONGO_URI 2>/dev/null | sed "s/:\\/\\/[^@]*@/:\\/\\/***@/g"; docker exec "$APP" printenv REDIS_HOST REDIS_PORT PORT ONBOARDING_AGENT_MCP_URL 2>/dev/null; fi',
    `grep -E '^(MONGO_URI|REDIS_|PORT|ONBOARDING)' ${ROOT}/Back-end/.secret 2>/dev/null | sed 's/=.*$/=***/'`,
    "echo '=== nginx agreeatime / ports ==='",
    "sudo grep -R -h -E 'location |proxy_pass|agreeatime|/app/g|3300|3301|3302|3303' /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null | head -40",
    "echo '=== curl smoke ==='",
    "for p in 3300 3301 3302 3303 3304; do c=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$p/ 2>/dev/null || echo 000); echo port_$p=$c; done",
    "curl -s -o /dev/null -w 'nginx_root=%{http_code}\\n' -H 'Host: bubblbook.com' http://127.0.0.1/",
    "curl -s -o /dev/null -w 'nginx_agree=%{http_code}\\n' -H 'Host: bubblbook.com' http://127.0.0.1/app/g/agreeatime",
    "curl -sk -o /dev/null -w 'https_root=%{http_code}\\n' https://bubblbook.com/",
    "curl -sk -o /dev/null -w 'https_agree=%{http_code}\\n' https://bubblbook.com/app/g/agreeatime",
    "for p in 3300 3301 3302 3303; do c=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$p/app/g/agreeatime 2>/dev/null || echo 000); echo agree_port_$p=$c; done",
    "echo '=== external mongo port check (from server itself) ==='",
    "curl -s --max-time 2 telnet://127.0.0.1:27017 2>&1 | head -1 || nc -zv 127.0.0.1 27017 2>&1",
    "curl -s --max-time 2 telnet://127.0.0.1:27018 2>&1 | head -1 || nc -zv 127.0.0.1 27018 2>&1",
    "echo '=== compose head ==='",
    `head -40 ${ROOT}/docker-compose.yml 2>/dev/null`,
    `test -f ${ROOT}/docker-compose.praxarch-build.yml && echo '--- praxarch-build ---' && cat ${ROOT}/docker-compose.praxarch-build.yml`,
    "echo DONE",
  ].join("\n");

  const b64 = Buffer.from(script).toString("base64");
  const out = await ssh(pk, `echo '${b64}' | base64 -d | bash`);
  console.log(out);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
