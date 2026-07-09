/**
 * Staging hotfix: build app from repo Dockerfile (includes onboarding agent)
 * instead of old ECR prod:v1 image.
 */
const { execFile } = require("child_process");
const { promisify } = require("util");
const { writeFile, unlink } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");
const { randomBytes } = require("crypto");
const execFileAsync = promisify(execFile);

const OVERRIDE = `services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    image: bubblbook-staging-local:latest
`;

async function ssh(pk, ip, cmd, timeout = 900000) {
  const keyPath = join(tmpdir(), `p-${randomBytes(4).toString("hex")}`);
  await writeFile(keyPath, pk, { mode: 0o600 });
  try {
    const { stdout, stderr } = await execFileAsync(
      "ssh",
      ["-i", keyPath, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", "-p", "22", `ubuntu@${ip}`, cmd],
      { timeout, maxBuffer: 8 * 1024 * 1024 }
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
  if (!pk) throw new Error("no ssh key");

  const root = "/data/coolify/applications/gacc5qlsha4e9nrqk1vf58b3";
  const overridePath = `${root}/docker-compose.staging-build.yml`;
  const b64 = Buffer.from(OVERRIDE).toString("base64");

  const cmd = [
    `cd ${root}`,
    `echo '${b64}' | base64 -d > docker-compose.staging-build.yml`,
    "echo '=== building app from Dockerfile (this takes several minutes) ==='",
    "sudo docker compose -f docker-compose.yml -f docker-compose.staging-build.yml build app 2>&1 | tail -30",
    "sudo docker compose -f docker-compose.yml -f docker-compose.staging-build.yml -f docker-compose.mcp.yml up -d app mcp 2>&1 | tail -15",
    "APP=$(docker ps --format '{{.Names}}' | grep app-gacc5 | head -1)",
    "echo app=$APP image=$(docker inspect $APP --format '{{.Config.Image}}')",
    "docker exec $APP sh -c 'test -f /app/routes/onboardingAgent.routes.js && echo has_onboarding_routes || ls /app/routes | head -5'",
    "docker exec $APP sh -c 'test -n \"$GEMINI_API_KEY\" && echo GEMINI_set || echo GEMINI_missing'",
    "curl -s http://127.0.0.1:3303/api/onboarding-agent/status -H 'Accept: application/json' | head -c 300",
    "echo",
  ].join(" && ");

  console.log(await ssh(pk, srv.ip, cmd));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
