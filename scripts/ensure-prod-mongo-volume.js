/** Ensure prod mongo uses the underscore data volume (run after Coolify deploy). */
const { execFile } = require("child_process");
const { promisify } = require("util");
const { writeFile, unlink } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");
const execFileAsync = promisify(execFile);

const ROOT = "/data/coolify/applications/nf6adysipbutbwzslufhhoqg";
const GOOD_VOL = "nf6adysipbutbwzslufhhoqg_mongo_data";

async function main() {
  const token = process.env.COOLIFY_API_TOKEN;
  const base = (process.env.COOLIFY_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
  const h = { Authorization: `Bearer ${token}` };
  const srv = await fetch(`${base}/api/v1/servers/ray76gl90ckl5iur3fk2zgvt`, { headers: h }).then((r) => r.json());
  const keysRaw = await fetch(`${base}/api/v1/security/keys`, { headers: h }).then((r) => r.json());
  const keys = Array.isArray(keysRaw) ? keysRaw : keysRaw.data ?? [];
  const kid = srv.private_key_uuid || srv.private_key_id;
  const pk = keys.find((k) => k.uuid === kid || k.id === kid)?.private_key;
  if (!pk) throw new Error("SSH key not found");

  const kp = join(tmpdir(), `k-${Date.now()}`);
  await writeFile(kp, pk, { mode: 0o600 });

  const script = [
    "#!/bin/bash",
    "set -e",
    `cd "${ROOT}"`,
    `cat > docker-compose.mongo-fix.yml <<'EOF'
services:
  mongo:
    container_name: mongo-latest
    image: mongo:7
    restart: always
    ports:
      - "27018:27017"
    volumes:
      - mongo_data:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "--quiet", "--eval", "db.adminCommand('ping').ok"]
      interval: 3s
      timeout: 10s
      retries: 20
      start_period: 15s
volumes:
  mongo_data:
    external: true
    name: ${GOOD_VOL}
EOF`,
    "sudo docker stop $(docker ps -q -f name=mongo-nf6adysipbutbwzslufhhoqg) 2>/dev/null || true",
    "sudo docker rm $(docker ps -aq -f name=mongo-nf6adysipbutbwzslufhhoqg) 2>/dev/null || true",
    "sudo docker compose -f docker-compose.yml -f docker-compose.mongo-fix.yml up -d mongo",
    "sleep 5",
    'docker exec mongo-latest mongosh --quiet bubblbook --eval "printjson({users:db.users.countDocuments()})"',
  ].join("\n");

  const b64 = Buffer.from(script).toString("base64");
  try {
    const { stdout } = await execFileAsync(
      "ssh",
      ["-i", kp, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=NUL", "-o", "ConnectTimeout=15", "ubuntu@34.251.139.131", `echo ${b64} | base64 -d | bash`],
      { timeout: 120000, maxBuffer: 2 * 1024 * 1024 }
    );
    console.log(stdout.trim());
  } finally {
    await unlink(kp).catch(() => undefined);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
