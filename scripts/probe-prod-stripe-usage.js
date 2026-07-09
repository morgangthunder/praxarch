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
      { timeout: 120_000, maxBuffer: 8 * 1024 * 1024 }
    );
    return stdout;
  } finally {
    await unlink(keyPath).catch(() => undefined);
  }
}

async function main() {
  const root = "/home/ubuntu/apps/master/bubbl_book/Back-end";
  const cmd = [
    `grep -rhoE "process\\.env\\.stripe_[a-z_]+" ${root} 2>/dev/null | sort -u`,
    `grep -rhoE "process\\.env\\.STRIPE_[A-Z_]+" ${root} 2>/dev/null | sort -u`,
    `grep -rni stripe ${root}/config 2>/dev/null | head -20 | sed 's/=.*/=<redacted>/'`,
    `ls -la ${root}/.secret ${root}/.env 2>/dev/null || true`,
    `grep -i stripe ${root}/.secret 2>/dev/null | sed 's/=.*/=<redacted>/' || true`,
  ].join(" ; echo '---' ; ");
  console.log(await ssh(`bash -lc '${cmd.replace(/'/g, "'\\''")}'`));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
