/** Fast prod state probe — containers, mongo users, ports. */
const { execFile } = require("child_process");
const { promisify } = require("util");
const { writeFile, unlink } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");
const execFileAsync = promisify(execFile);

async function getKey() {
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
  return kp;
}

async function main() {
  const kp = await getKey();
  const cmd = [
    "docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'",
    "MONGO=$(docker ps --format '{{.Names}}' | grep mongo | head -1); echo mongo_container=$MONGO",
    'if [ -n "$MONGO" ]; then docker inspect "$MONGO" --format "mongo_mount={{range .Mounts}}{{.Name}} {{end}}"; docker exec "$MONGO" mongosh --quiet bubblbook --eval "printjson({users:db.users.countDocuments()})"; else echo mongo_container=NONE; fi',
    "curl -s -o /dev/null -w 'ports3300=%{http_code} https=%{http_code}\\n' --max-time 6 http://127.0.0.1:3300/ https://bubblbook.com/",
  ].join("; ");
  try {
    const { stdout } = await execFileAsync(
      "ssh",
      ["-i", kp, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=NUL", "-o", "ConnectTimeout=15", "ubuntu@34.251.139.131", cmd],
      { timeout: 60000, maxBuffer: 2 * 1024 * 1024 }
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
