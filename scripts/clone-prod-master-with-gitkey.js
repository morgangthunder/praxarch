/** Clone private repo on prod using Coolify git deploy key */
const { execFile } = require("child_process");
const { promisify } = require("util");
const { writeFile, unlink } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");
const execFileAsync = promisify(execFile);

const ROOT = "/data/coolify/applications/nf6adysipbutbwzslufhhoqg";
const GIT_KEY_ID = 2;

async function sshWith(pk, cmd, timeout = 300000) {
  const kp = join(tmpdir(), `k-${Date.now()}`);
  await writeFile(kp, pk, { mode: 0o600 });
  try {
    const { stdout, stderr } = await execFileAsync(
      "ssh",
      ["-i", kp, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", "ubuntu@34.251.139.131", cmd],
      { timeout, maxBuffer: 8 * 1024 * 1024 }
    );
    return (stdout || "") + (stderr || "");
  } finally {
    await unlink(kp).catch(() => undefined);
  }
}

async function main() {
  const token = process.env.COOLIFY_API_TOKEN;
  const base = (process.env.COOLIFY_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
  const h = { Authorization: `Bearer ${token}` };
  const keys = await fetch(`${base}/api/v1/security/keys`, { headers: h }).then((r) => r.json());
  const serverPk = keys.find((k) => k.id === 1)?.private_key;
  const gitPk = keys.find((k) => k.id === GIT_KEY_ID)?.private_key;
  if (!serverPk || !gitPk) throw new Error("missing keys");

  const gitKeyB64 = Buffer.from(gitPk).toString("base64");
  const script = [
    "#!/bin/bash",
    "set -e",
    "mkdir -p ~/.ssh && chmod 700 ~/.ssh",
    `echo '${gitKeyB64}' | base64 -d > ~/.ssh/coolify_git_bubblbook`,
    "chmod 600 ~/.ssh/coolify_git_bubblbook",
    'ssh-keyscan github.com >> ~/.ssh/known_hosts 2>/dev/null || true',
    `sudo rm -rf ${ROOT}`,
    `sudo mkdir -p ${ROOT} && sudo chown ubuntu:ubuntu ${ROOT}`,
    `cd ${ROOT}`,
    "GIT_SSH_COMMAND='ssh -i ~/.ssh/coolify_git_bubblbook -o StrictHostKeyChecking=no' git clone --branch master --depth 1 git@github.com:Bubblbook/bubbl_book.git .",
    "ls -la docker-compose.yml Dockerfile docker-compose.mcp.yml",
  ].join("\n");

  const out = await sshWith(serverPk, `bash -lc 'echo ${Buffer.from(script).toString("base64")} | base64 -d | bash'`);
  console.log(out);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
