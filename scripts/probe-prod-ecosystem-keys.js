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
  const srv = await fetch(`${base}/api/v1/servers/ray76gl90ckl5iur3fk2zgvt`, { headers: h }).then((r) => r.json());
  const keys = await fetch(`${base}/api/v1/security/keys`, { headers: h }).then((r) => r.json());
  const kid = srv.private_key_uuid || srv.private_key_id;
  const pk = keys.find((k) => k.uuid === kid || k.id === kid)?.private_key;
  const keyPath = join(tmpdir(), `k-${randomBytes(4).toString("hex")}`);
  await writeFile(keyPath, pk, { mode: 0o600 });
  try {
    const { stdout } = await execFileAsync(
      "ssh",
      ["-i", keyPath, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", "-p", String(srv.port || 22), `ubuntu@${srv.ip}`, cmd],
      { timeout: 60_000, maxBuffer: 4 * 1024 * 1024 }
    );
    return stdout;
  } finally {
    await unlink(keyPath).catch(() => undefined);
  }
}

async function main() {
  const out = await ssh("cat /home/ubuntu/apps/ecosystem.config.js");
  // Print only keys in env: { ... } blocks (names only)
  const keys = new Set();
  for (const m of out.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/gm)) keys.add(m[1]);
  const stripeish = [...keys].filter((k) => /stripe|paypal|secret|price|prod/i.test(k)).sort();
  console.log("ecosystem env keys (payment-related):", stripeish.join(", ") || "(none)");
  console.log("file bytes:", out.length);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
