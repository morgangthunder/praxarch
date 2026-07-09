const { execFile } = require("child_process");
const { promisify } = require("util");
const { writeFile, unlink } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");
const { randomBytes } = require("crypto");
const execFileAsync = promisify(execFile);

async function main() {
  const token = process.env.COOLIFY_API_TOKEN;
  const base = process.env.COOLIFY_API_URL.replace(/\/$/, "");
  const h = { Authorization: `Bearer ${token}` };
  const srv = await fetch(`${base}/api/v1/servers/rorxx790bkr8db4ssro9v5fh`, { headers: h }).then((r) => r.json());
  const keys = await fetch(`${base}/api/v1/security/keys`, { headers: h }).then((r) => r.json());
  const kid = srv.private_key_uuid || srv.private_key_id;
  const pk = keys.find((k) => k.uuid === kid || k.id === kid)?.private_key;
  if (!pk) throw new Error("no key");
  const keyPath = join(tmpdir(), `p-${randomBytes(4).toString("hex")}`);
  await writeFile(keyPath, pk, { mode: 0o600 });
  const root = "/data/coolify/applications/gacc5qlsha4e9nrqk1vf58b3";
  const cmd = `sed -n '145,200p' ${root}/Back-end/controllers/onboardingAgent.controller.js; echo '---'; sed -n '1,80p' ${root}/Back-end/services/llm/provider-factory.js; echo '---'; grep -n onboardingAgent ${root}/Back-end/server.js | head -5`;
  try {
    const { stdout } = await execFileAsync("ssh", ["-i", keyPath, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", "-p", "22", `ubuntu@${srv.ip}`, cmd], { timeout: 60000 });
    console.log(stdout);
  } finally { await unlink(keyPath).catch(() => {}); }
}
main().catch(e => { console.error(e.message); process.exit(1); });
