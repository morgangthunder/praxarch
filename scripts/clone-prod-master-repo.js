/** Clone master repo into prod Coolify app dir via HTTPS */
const { execFile } = require("child_process");
const { promisify } = require("util");
const { writeFile, unlink } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");
const execFileAsync = promisify(execFile);

const ROOT = "/data/coolify/applications/nf6adysipbutbwzslufhhoqg";

async function main() {
  const token = process.env.COOLIFY_API_TOKEN;
  const base = (process.env.COOLIFY_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
  const h = { Authorization: `Bearer ${token}` };
  const keys = await fetch(`${base}/api/v1/security/keys`, { headers: h }).then((r) => r.json());
  const pk = keys.find((k) => k.id === 1)?.private_key;
  if (!pk) throw new Error("no ssh key");

  const script = [
    "#!/bin/bash",
    "set -e",
    `sudo rm -rf ${ROOT}`,
    `sudo mkdir -p ${ROOT}`,
    `sudo chown ubuntu:ubuntu ${ROOT}`,
    `cd ${ROOT}`,
    "git clone --branch master --depth 1 https://github.com/Bubblbook/bubbl_book.git .",
    "ls -la docker-compose.yml Dockerfile docker-compose.mcp.yml 2>/dev/null || (echo MISSING_FILES && ls | head -10)",
  ].join("\n");

  const kp = join(tmpdir(), `k-${Date.now()}`);
  await writeFile(kp, pk, { mode: 0o600 });
  try {
    const b64 = Buffer.from(script).toString("base64");
    const { stdout } = await execFileAsync(
      "ssh",
      ["-i", kp, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", "ubuntu@34.251.139.131", `bash -lc 'echo ${b64} | base64 -d | bash'`],
      { timeout: 300000, maxBuffer: 4 * 1024 * 1024 }
    );
    console.log(stdout);
  } finally {
    await unlink(kp).catch(() => undefined);
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
