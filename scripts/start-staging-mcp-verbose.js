const { execFile } = require("child_process");
const { promisify } = require("util");
const { writeFile, unlink } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");
const execFileAsync = promisify(execFile);

async function main() {
  const token = process.env.COOLIFY_API_TOKEN;
  const base = process.env.COOLIFY_API_URL.replace(/\/$/, "");
  const h = { Authorization: `Bearer ${token}` };
  const srv = await fetch(`${base}/api/v1/servers/rorxx790bkr8db4ssro9v5fh`, { headers: h }).then((r) => r.json());
  const keys = await fetch(`${base}/api/v1/security/keys`, { headers: h }).then((r) => r.json());
  const kid = srv.private_key_uuid || srv.private_key_id;
  const pk = keys.find((k) => k.uuid === kid || k.id === kid)?.private_key;
  const keyPath = join(tmpdir(), "k");
  await writeFile(keyPath, pk, { mode: 0o600 });
  const root = "/data/coolify/applications/gacc5qlsha4e9nrqk1vf58b3";
  const cmd = `cd ${root} && sudo docker compose -f docker-compose.yml -f docker-compose.mcp.yml up -d --build mcp 2>&1 | tail -40`;
  try {
    const { stdout, stderr } = await execFileAsync(
      "ssh",
      ["-i", keyPath, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", `ubuntu@${srv.ip}`, cmd],
      { timeout: 600000, maxBuffer: 8 * 1024 * 1024 }
    );
    console.log(stdout || stderr);
    const check = await execFileAsync(
      "ssh",
      ["-i", keyPath, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", `ubuntu@${srv.ip}`, "sudo docker ps -a | grep -i mcp; curl -s http://127.0.0.1:3400/health"],
      { timeout: 60000 }
    );
    console.log("--- check ---\n", check.stdout);
  } finally {
    await unlink(keyPath);
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
