/** Free build cache then kick off staging source build in background. */
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
      ["-i", keyPath, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", "-o", "ConnectTimeout=15", `ubuntu@${ip}`, cmd],
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

  console.log("Pruning docker build cache...");
  console.log(await ssh(pk, ip, "sudo docker builder prune -af 2>&1 | tail -5; df -h / | tail -1", 180000));

  const overlayB64 = Buffer.from(OVERLAY).toString("base64");
  const script = [
    "#!/bin/bash",
    "set -e",
    `cd ${root}`,
    `echo '${overlayB64}' | base64 -d > docker-compose.praxarch-build.yml`,
    "sudo docker compose -f docker-compose.yml -f docker-compose.praxarch-build.yml build app",
    "sudo docker compose -f docker-compose.yml -f docker-compose.praxarch-build.yml -f docker-compose.mcp.yml up -d app mcp",
    "echo DONE > /tmp/bubblbook-staging-build.done",
  ].join("\n");
  const scriptB64 = Buffer.from(script).toString("base64");
  const start = [
    `echo '${scriptB64}' | base64 -d > /tmp/rebuild-staging.sh`,
    "chmod +x /tmp/rebuild-staging.sh",
    "rm -f /tmp/bubblbook-staging-build.done /tmp/bubblbook-staging-build.log",
    "nohup /tmp/rebuild-staging.sh > /tmp/bubblbook-staging-build.log 2>&1 </dev/null &",
    "sleep 2",
    "echo BUILD_STARTED",
    "pgrep -af rebuild-staging || true",
    "df -h / | tail -1",
  ].join("; ");

  console.log(await ssh(pk, ip, start, 60000));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
