/**
 * Safer staging source build: ensure swap, prune cache, then build async.
 */
const { execFile } = require("child_process");
const { promisify } = require("util");
const { writeFile, unlink } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");
const execFileAsync = promisify(execFile);

const OVERLAY = `services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    image: praxarch-local-app:latest
`;

async function ssh(pk, ip, cmd, timeout = 120000) {
  const keyPath = join(tmpdir(), `k-${Date.now()}`);
  await writeFile(keyPath, pk, { mode: 0o600 });
  try {
    const { stdout, stderr } = await execFileAsync(
      "ssh",
      ["-i", keyPath, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", "-o", "ConnectTimeout=45", "-o", "ServerAliveInterval=15", `ubuntu@${ip}`, cmd],
      { timeout, maxBuffer: 4 * 1024 * 1024 }
    );
    return stdout || stderr;
  } finally {
    await unlink(keyPath).catch(() => undefined);
  }
}

async function main() {
  const token = process.env.COOLIFY_API_TOKEN;
  const base = process.env.COOLIFY_API_URL.replace(/\/$/, "");
  const h = { Authorization: `Bearer ${token}` };
  const srv = await fetch(`${base}/api/v1/servers/rorxx790bkr8db4ssro9v5fh`, { headers: h }).then((r) => r.json());
  const keys = await fetch(`${base}/api/v1/security/keys`, { headers: h }).then((r) => r.json());
  const kid = srv.private_key_uuid || srv.private_key_id;
  const pk = keys.find((k) => k.uuid === kid || k.id === kid)?.private_key;
  const ip = srv.ip;
  const root = "/data/coolify/applications/gacc5qlsha4e9nrqk1vf58b3";

  // Quick connectivity check
  try {
    const ping = await ssh(pk, ip, "echo SSH_OK; uptime; free -h | head -2; df -h / | tail -1", 60000);
    console.log(ping);
  } catch (e) {
    console.error("SSH not ready:", e.message);
    process.exit(2);
  }

  // Ensure 2G swap, prune builder cache, then kick build
  const overlayB64 = Buffer.from(OVERLAY).toString("base64");
  const buildScript = [
    "#!/bin/bash",
    "set -e",
    "# Free disk before build (20GB root fills fast)",
    "sudo docker builder prune -af 2>&1 | tail -3 || true",
    "sudo docker image prune -af 2>&1 | tail -3 || true",
    "df -h / | tail -1",
    "# Small swap only if missing and enough free space",
    "if ! swapon --show | grep -q /swapfile; then",
    "  FREE=$(df / | tail -1 | awk '{print $4}')",
    "  if [ \"$FREE\" -gt 1500000 ]; then",
    "    sudo fallocate -l 1G /swapfile 2>/dev/null || sudo dd if=/dev/zero of=/swapfile bs=1M count=1024",
    "    sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile",
    "    grep -q /swapfile /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab",
    "  fi",
    "fi",
    "free -h",
    `cd ${root}`,
    `echo '${overlayB64}' | base64 -d > docker-compose.praxarch-build.yml`,
    "export DOCKER_BUILDKIT=1",
    "export COMPOSE_DOCKER_CLI_BUILD=1",
    "sudo -E docker compose -f docker-compose.yml -f docker-compose.praxarch-build.yml build --progress=plain app",
    "sudo docker compose -f docker-compose.yml -f docker-compose.praxarch-build.yml -f docker-compose.mcp.yml up -d app mcp",
    "echo DONE > /tmp/bubblbook-staging-build.done",
  ].join("\n");
  const scriptB64 = Buffer.from(buildScript).toString("base64");

  const start = [
    `echo '${scriptB64}' | base64 -d > /tmp/rebuild-staging.sh`,
    "chmod +x /tmp/rebuild-staging.sh",
    "rm -f /tmp/bubblbook-staging-build.done /tmp/bubblbook-staging-build.log",
    "nohup /tmp/rebuild-staging.sh > /tmp/bubblbook-staging-build.log 2>&1 </dev/null & disown",
    "sleep 2",
    "echo BUILD_STARTED",
    "pgrep -af rebuild-staging || true",
  ].join("; ");

  console.log(await ssh(pk, ip, start, 90000));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
