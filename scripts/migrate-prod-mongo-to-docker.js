/**
 * Migrate host MongoDB 4.0 (127.0.0.1:27017) → docker mongo:7 (127.0.0.1:27018).
 * Required because mongoose in master requires MongoDB 4.2+ wire protocol.
 */
const { execFile } = require("child_process");
const { promisify } = require("util");
const { writeFile, unlink } = require("fs/promises");
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
      ["-i", keyPath, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", "-o", "ConnectTimeout=20", `ubuntu@${SERVER_IP}`, cmd],
      { timeout, maxBuffer: 8 * 1024 * 1024 }
    );
    return (stdout || "") + (stderr || "");
  } finally {
    await unlink(keyPath).catch(() => undefined);
  }
}

async function main() {
  let pk = process.env.SSH_PRIVATE_KEY;
  if (!pk && process.env.SSH_KEY_FILE) {
    pk = await require("fs/promises").readFile(process.env.SSH_KEY_FILE, "utf8");
  }
  if (!pk) {
    const token = process.env.COOLIFY_API_TOKEN;
    const base = (process.env.COOLIFY_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
    const h = { Authorization: `Bearer ${token}` };
    const keys = await fetch(`${base}/api/v1/security/keys`, { headers: h }).then((r) => r.json());
    pk = keys.find((k) => k.id === 1)?.private_key;
  }
  if (!pk) throw new Error("SSH key not found");

  const remoteScript = [
    "#!/bin/bash",
    "set -e",
    `cd ${COOLIFY_ROOT}`,
    'SRC=$(grep "^MONGO_URI=" Back-end/.secret | head -1 | cut -d= -f2-)',
    'echo "source redacted"',
    "rm -rf /tmp/bb-mongo-migrate && mkdir -p /tmp/bb-mongo-migrate",
    'mongodump --uri="$SRC" --out /tmp/bb-mongo-migrate/dump 2>&1 | tail -5',
    "ls /tmp/bb-mongo-migrate/dump",
    'docker run --rm --network host -v /tmp/bb-mongo-migrate/dump:/dump mongo:7 mongorestore --drop --uri="mongodb://127.0.0.1:27018" /dump 2>&1 | tail -8',
    'docker exec mongo-latest mongosh --quiet bubblbook --eval "db.getCollectionNames().length"',
    "NEW_URI=mongodb://127.0.0.1:27018/bubblbook",
    'sed -i "s|^MONGO_URI=.*|MONGO_URI=$NEW_URI|" Back-end/.secret .env',
    "grep MONGO_URI Back-end/.secret | sed 's/:\\/\\/[^@]*@/:\\/\\/***@/g'",
    "sudo docker compose -f docker-compose.yml -f docker-compose.praxarch-build.yml -f docker-compose.mcp.yml up -d --force-recreate app",
    "sleep 15",
    "docker logs work-latest 2>&1 | grep -iE 'mongo|mongoose|connected' | tail -5",
    "curl -s -o /dev/null -w 'health=%{http_code}\\n' http://127.0.0.1:3300/",
  ].join("\n");

  const b64 = Buffer.from(remoteScript).toString("base64");
  console.log(await ssh(pk, `echo '${b64}' | base64 -d | bash`, 600000));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
