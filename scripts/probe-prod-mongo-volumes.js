/** Quick prod mongo volume + user count probe (Windows-friendly). */
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
  const srv = await fetch(`${base}/api/v1/servers/ray76gl90ckl5iur3fk2zgvt`, { headers: h }).then((r) => r.json());
  const keysRaw = await fetch(`${base}/api/v1/security/keys`, { headers: h }).then((r) => r.json());
  const keys = Array.isArray(keysRaw) ? keysRaw : keysRaw.data ?? [];
  const kid = srv.private_key_uuid || srv.private_key_id;
  const pk = keys.find((k) => k.uuid === kid || k.id === kid)?.private_key;
  if (!pk) throw new Error("SSH key not found");

  const kp = join(tmpdir(), `k-${Date.now()}`);
  await writeFile(kp, pk, { mode: 0o600 });
  const cmd = [
    "MONGO=$(docker ps --format '{{.Names}}' | grep mongo | head -1)",
    'echo mounted=$(docker inspect "$MONGO" --format "{{range .Mounts}}{{.Name}} {{end}}")',
    'docker exec "$MONGO" mongosh --quiet bubblbook --eval "printjson({users:db.users.countDocuments(),activities:db.activities.countDocuments()})"',
    "sudo du -sh /var/lib/docker/volumes/mongo_data/_data /var/lib/docker/volumes/nf6adysipbutbwzslufhhoqg_mongo_data/_data /var/lib/docker/volumes/nf6adysipbutbwzslufhhoqg_mongo-data/_data 2>/dev/null",
    "curl -s -o /dev/null -w 'local3300=%{http_code} https=%{http_code}\\n' --max-time 8 http://127.0.0.1:3300/ https://bubblbook.com/",
  ].join("; ");

  try {
    const { stdout } = await execFileAsync(
      "ssh",
      ["-i", kp, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=NUL", "-o", "ConnectTimeout=15", "ubuntu@34.251.139.131", cmd],
      { timeout: 90000, maxBuffer: 4 * 1024 * 1024 }
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
