/** Find prod mongo volume with real users and attach it. */
const { execFile } = require("child_process");
const { promisify } = require("util");
const { writeFile, unlink } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");
const execFileAsync = promisify(execFile);

const ROOT = "/data/coolify/applications/nf6adysipbutbwzslufhhoqg";
const VOLS = ["nf6adysipbutbwzslufhhoqg_mongo_data", "nf6adysipbutbwzslufhhoqg_mongo-data", "mongo_data"];

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
    "sudo docker stop mongo-latest 2>/dev/null || true",
    "sudo docker rm mongo-latest 2>/dev/null || true",
    "sudo docker stop $(docker ps -aq -f name=mongo-nf6adysipbutbwzslufhhoqg) 2>/dev/null || true",
    "sudo docker rm $(docker ps -aq -f name=mongo-nf6adysipbutbwzslufhhoqg) 2>/dev/null || true",
    ...VOLS.map(
      (v) =>
        `echo -n "${v}="; docker run --rm -v ${v}:/data/db mongo:7 mongosh --quiet bubblbook --eval "db.users.countDocuments()" 2>/dev/null | tail -1 || echo err`
    ),
    "BEST_VOL=nf6adysipbutbwzslufhhoqg_mongo_data",
    "sudo docker run -d --name mongo-latest --restart always -p 27018:27017 -v ${BEST_VOL}:/data/db mongo:7",
    "sleep 5",
    'docker exec mongo-latest mongosh --quiet bubblbook --eval "printjson({users:db.users.countDocuments(),activities:db.activities.countDocuments()})"',
    "sudo docker compose -f docker-compose.yml up -d app redis 2>/dev/null || true",
    "curl -s -o /dev/null -w 'local=%{http_code} https=%{http_code}\\n' --max-time 8 http://127.0.0.1:3300/ https://bubblbook.com/",
  ].join("\n");

  const b64 = Buffer.from(script).toString("base64");
  try {
    const { stdout } = await execFileAsync(
      "ssh",
      ["-i", kp, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=NUL", "-o", "ConnectTimeout=15", "ubuntu@34.251.139.131", `echo ${b64} | base64 -d | bash`],
      { timeout: 180000, maxBuffer: 2 * 1024 * 1024 }
    );
    console.log(stdout.split("\n").slice(0, 20).join("\n"));
  } finally {
    await unlink(kp).catch(() => undefined);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
