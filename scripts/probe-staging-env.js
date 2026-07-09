/**
 * One-off probe: check whether ADMIN_SECRET is present in the running staging container.
 * Reports lengths only — never prints secret values.
 */
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
  const serverUuid = "rorxx790bkr8db4ssro9v5fh";
  const container = process.argv[2] || "app-gacc5qlsha4e9nrqk1vf58b3-183808902901";

  const headers = { Authorization: `Bearer ${token}` };
  const srv = await fetch(`${base}/api/v1/servers/${serverUuid}`, { headers }).then((r) => r.json());
  const keys = await fetch(`${base}/api/v1/security/keys`, { headers }).then((r) => r.json());
  const keyId = srv.private_key_uuid || srv.private_key_id;
  const keyObj = keys.find((k) => k.uuid === keyId || k.id === keyId);
  const privateKey = keyObj?.private_key;
  if (!privateKey) {
    console.error("SSH private key not found");
    process.exit(1);
  }

  const keyPath = join(tmpdir(), `probe-${randomBytes(4).toString("hex")}`);
  await writeFile(keyPath, privateKey, { mode: 0o600 });

  const remoteCmd = `for c in $(docker ps --format '{{.Names}}' | grep gacc5qlsha4e9nrqk1vf58b3 | grep '^app-'); do echo container=$c; docker exec $c sh -c 'echo secret_len=\${#secret}; test -n "\$secret" && echo secret_present=yes || echo secret_present=no'; done`;

  try {
    const { stdout, stderr } = await execFileAsync(
      "ssh",
      [
        "-i",
        keyPath,
        "-o",
        "BatchMode=yes",
        "-o",
        "StrictHostKeyChecking=accept-new",
        "-o",
        "UserKnownHostsFile=/dev/null",
        "-p",
        String(srv.port || 22),
        `${srv.user || "root"}@${srv.ip}`,
        remoteCmd,
      ],
      { timeout: 30_000, maxBuffer: 5 * 1024 * 1024 }
    );
    console.log(stdout.trim() || stderr.trim());
  } finally {
    await unlink(keyPath).catch(() => undefined);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
