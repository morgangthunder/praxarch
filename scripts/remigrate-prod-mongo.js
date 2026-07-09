/**
 * Re-migrate host MongoDB 4.0 → docker mongo:7 using mongo:7 mongorestore (4.0 client fails).
 */
const { execFile } = require("child_process");
const { promisify } = require("util");
const { writeFile, unlink, readFile } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");
const execFileAsync = promisify(execFile);

const SERVER_IP = "34.251.139.131";
const COOLIFY_ROOT = "/data/coolify/applications/nf6adysipbutbwzslufhhoqg";

async function ssh(pk, cmd, timeout = 600000) {
  const keyPath = join(tmpdir(), `k-${Date.now()}`);
  await writeFile(keyPath, pk, { mode: 0o600 });
  try {
    const { stdout, stderr } = await execFileAsync(
      "ssh",
      ["-i", keyPath, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", `ubuntu@${SERVER_IP}`, cmd],
      { timeout, maxBuffer: 8 * 1024 * 1024 }
    );
    return (stdout || "") + (stderr || "");
  } finally {
    await unlink(keyPath).catch(() => undefined);
  }
}

async function main() {
  let pk = process.env.SSH_PRIVATE_KEY;
  if (!pk && process.env.SSH_KEY_FILE) pk = await readFile(process.env.SSH_KEY_FILE, "utf8");
  if (!pk) {
    const token = process.env.COOLIFY_API_TOKEN;
    const base = (process.env.COOLIFY_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
    const keys = await fetch(`${base}/api/v1/security/keys`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
    pk = keys.find((k) => k.id === 1)?.private_key;
  }
  if (!pk) throw new Error("SSH key not found");

  const script = [
    "#!/bin/bash",
    "set -e",
    `cd ${COOLIFY_ROOT}`,
    "SRC='mongodb://bbadmin:hdfhn7dbDkgnHyH@127.0.0.1:27017/?authSource=admin'",
    "rm -rf /tmp/bb-mongo-migrate && mkdir -p /tmp/bb-mongo-migrate",
    'echo "=== dump from host mongo 4.0 ==="',
    'mongodump --uri="$SRC" --out /tmp/bb-mongo-migrate/dump 2>&1 | tail -3',
    'du -sh /tmp/bb-mongo-migrate/dump',
    'ls /tmp/bb-mongo-migrate/dump',
    'echo "=== restore via mongo:7 client ==="',
    'docker run --rm --network host -v /tmp/bb-mongo-migrate/dump:/dump mongo:7 mongorestore --drop --uri="mongodb://127.0.0.1:27018" /dump 2>&1 | tail -12',
    'echo "=== verify docker mongo ==="',
    'docker exec mongo-latest mongosh --quiet bubblbook --eval "printjson({users:db.users.countDocuments(),activities:db.activities.countDocuments()})"',
    'grep -q "^MONGO_URI=mongodb://127.0.0.1:27018/bubblbook" Back-end/.secret || sed -i "s|^MONGO_URI=.*|MONGO_URI=mongodb://127.0.0.1:27018/bubblbook|" Back-end/.secret .env',
    "sudo docker compose -f docker-compose.yml -f docker-compose.praxarch-build.yml -f docker-compose.mcp.yml up -d --force-recreate app",
    "sleep 12",
    "docker logs work-latest 2>&1 | grep -i 'connected to db' | tail -1",
    "curl -s -o /dev/null -w 'health=%{http_code}\\n' https://bubblbook.com/",
  ].join("\n");

  const b64 = Buffer.from(script).toString("base64");
  console.log(await ssh(pk, `echo '${b64}' | base64 -d | bash`));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
