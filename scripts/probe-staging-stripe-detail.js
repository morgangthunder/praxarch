const { execFile } = require("child_process");
const { promisify } = require("util");
const { writeFile, unlink } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");
const { randomBytes } = require("crypto");
const execFileAsync = promisify(execFile);

async function ssh(cmd) {
  const token = process.env.COOLIFY_API_TOKEN;
  const base = process.env.COOLIFY_API_URL.replace(/\/$/, "");
  const h = { Authorization: `Bearer ${token}` };
  const srv = await fetch(`${base}/api/v1/servers/rorxx790bkr8db4ssro9v5fh`, { headers: h }).then((r) => r.json());
  const keys = await fetch(`${base}/api/v1/security/keys`, { headers: h }).then((r) => r.json());
  const kid = srv.private_key_uuid || srv.private_key_id;
  const pk = keys.find((k) => k.uuid === kid || k.id === kid)?.private_key;
  const keyPath = join(tmpdir(), `k-${randomBytes(4).toString("hex")}`);
  await writeFile(keyPath, pk, { mode: 0o600 });
  try {
    const { stdout } = await execFileAsync(
      "ssh",
      ["-i", keyPath, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", "-p", String(srv.port || 22), `ubuntu@${srv.ip}`, cmd],
      { timeout: 120_000, maxBuffer: 8 * 1024 * 1024 }
    );
    return stdout;
  } finally {
    await unlink(keyPath).catch(() => undefined);
  }
}

async function main() {
  const app = "app-gacc5qlsha4e9nrqk1vf58b3-215329321191";
  const cmd = `bash -lc 'docker exec ${app} sh -c "grep -rn stripe_pb_key /app 2>/dev/null; grep -rn stripe_subscription_prod /app 2>/dev/null; grep -rn stripe_wh /app/controllers/eventPayments/stripe/stripe.controller.js 2>/dev/null | head -5; sed -n \\\"1,120p\\\" /app/controllers/eventPayments/stripe/stripe.controller.js | tail -40"'`;
  console.log(await ssh(cmd));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
