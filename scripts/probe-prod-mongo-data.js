const { execFile } = require("child_process");
const { promisify } = require("util");
const { writeFile, unlink, readFile } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");
const execFileAsync = promisify(execFile);

const SERVER_IP = "34.251.139.131";

async function ssh(pk, cmd, timeout = 120000) {
  const keyPath = join(tmpdir(), `k-${Date.now()}`);
  await writeFile(keyPath, pk, { mode: 0o600 });
  try {
    const { stdout, stderr } = await execFileAsync(
      "ssh",
      ["-i", keyPath, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", `ubuntu@${SERVER_IP}`, cmd],
      { timeout, maxBuffer: 4 * 1024 * 1024 }
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
    "SRC='mongodb://bbadmin:hdfhn7dbDkgnHyH@127.0.0.1:27017/bubblbook?authSource=admin'",
    'echo "=== HOST mongo 4.0 shell ==="',
    'mongo "$SRC" --quiet --eval "printjson({users:db.users.count(),activities:db.activities.count(),hubs:db.hubs.count(),events:db.events.count()})" 2>&1',
    'echo "=== DOCKER mongo 7 (current app target) ==="',
    'docker exec mongo-latest mongosh --quiet bubblbook --eval "printjson({users:db.users.countDocuments(),activities:db.activities.countDocuments(),hubs:db.hubs.countDocuments(),events:db.events.countDocuments()})"',
    'echo "=== REMOTE mongo 52.208.203.249 ==="',
    'docker run --rm mongo:7 mongosh "mongodb://alphabbadmin:test@52.208.203.249/bubblbook" --quiet --eval "printjson({users:db.users.countDocuments(),activities:db.activities.countDocuments(),hubs:db.hubs.countDocuments(),events:db.events.countDocuments()})" 2>&1 | tail -8',
  ].join("\n");

  const b64 = Buffer.from(script).toString("base64");
  console.log(await ssh(pk, `echo '${b64}' | base64 -d | bash`));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
