/**
 * Mongo counts, no-auth external port check, compose files on prod.
 */
const { execFile } = require("child_process");
const { promisify } = require("util");
const { writeFile, unlink } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");
const execFileAsync = promisify(execFile);

const ROOT = "/data/coolify/applications/nf6adysipbutbwzslufhhoqg";

async function main() {
  const token = process.env.COOLIFY_API_TOKEN;
  const base = (process.env.COOLIFY_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
  const h = { Authorization: `Bearer ${token}` };
  const srv = await fetch(`${base}/api/v1/servers/ray76gl90ckl5iur3fk2zgvt`, { headers: h }).then((r) => r.json());
  const keys = await fetch(`${base}/api/v1/security/keys`, { headers: h }).then((r) => r.json());
  const kid = srv.private_key_uuid || srv.private_key_id;
  const pk = keys.find((k) => k.uuid === kid || k.id === kid)?.private_key;
  const kp = join(tmpdir(), `k-${Date.now()}`);
  await writeFile(kp, pk, { mode: 0o600 });

  const script = [
    "docker exec mongo-latest mongosh --quiet bubblbook --eval \"printjson({users:db.users.countDocuments(),activities:db.activities.countDocuments(),events:db.events.countDocuments(),cols:db.getCollectionNames().length})\"",
    "echo '--- no-auth via 27018 ---'",
    "docker run --rm --network host mongo:7 mongosh 'mongodb://127.0.0.1:27018/bubblbook' --quiet --eval 'db.users.countDocuments()' 2>&1 | tail -2",
    "echo '--- host mongo 4.0 via docker client ---'",
    "docker run --rm --network host mongo:7 mongosh 'mongodb://bbadmin:hdfhn7dbDkgnHyH@127.0.0.1:27017/bubblbook?authSource=admin' --quiet --eval 'db.users.countDocuments()' 2>&1 | tail -2",
    `echo '--- compose ---' && head -80 ${ROOT}/docker-compose.yml`,
    `echo '--- overlay ---' && cat ${ROOT}/docker-compose.praxarch-build.yml 2>/dev/null || echo none`,
    `echo '--- mcp ---' && head -30 ${ROOT}/docker-compose.mcp.yml 2>/dev/null || echo none`,
  ].join("\n");

  try {
    const { stdout } = await execFileAsync(
      "ssh",
      ["-i", kp, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", "ubuntu@34.251.139.131", script],
      { timeout: 120000, maxBuffer: 8 * 1024 * 1024 }
    );
    console.log(stdout);
  } finally {
    await unlink(kp).catch(() => undefined);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
