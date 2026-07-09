/** Start staging source build in background (fixed base64 overlay). */
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
  const cmd = `echo '${scriptB64}' | base64 -d > /tmp/rebuild-staging.sh && chmod +x /tmp/rebuild-staging.sh && rm -f /tmp/bubblbook-staging-build.done /tmp/bubblbook-staging-build.log && nohup /tmp/rebuild-staging.sh > /tmp/bubblbook-staging-build.log 2>&1 </dev/null & disown && sleep 2 && echo started && pgrep -af rebuild-staging || true`;
  const { stdout } = await execFileAsync(
    "ssh",
    ["-i", keyPath, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", `ubuntu@${srv.ip}`, cmd],
    { timeout: 30000 }
  );
  console.log(stdout);
  await unlink(keyPath);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
