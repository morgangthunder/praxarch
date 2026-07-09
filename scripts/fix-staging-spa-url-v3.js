const { execFile } = require("child_process");
const { promisify } = require("util");
const { writeFile, unlink } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");
const execFileAsync = promisify(execFile);

const SPA = "https://alpha.bubblbook.com";
const ROOT = "/data/coolify/applications/gacc5qlsha4e9nrqk1vf58b3";

async function main() {
  const token = process.env.COOLIFY_API_TOKEN;
  const base = process.env.COOLIFY_API_URL.replace(/\/$/, "");
  const h = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const appUuid = "gacc5qlsha4e9nrqk1vf58b3";

  // Upsert in Coolify API
  const envs = await fetch(`${base}/api/v1/applications/${appUuid}/envs`, { headers: h }).then((r) => r.json());
  const existing = envs.find((e) => e.key === "BUBBLBOOK_SPA_URL");
  if (existing) {
    await fetch(`${base}/api/v1/applications/${appUuid}/envs/${existing.uuid}`, {
      method: "PATCH",
      headers: h,
      body: JSON.stringify({ key: "BUBBLBOOK_SPA_URL", value: SPA, is_preview: false, is_build_time: false, is_literal: true }),
    });
    console.log("coolify PATCH BUBBLBOOK_SPA_URL");
  } else {
    await fetch(`${base}/api/v1/applications/${appUuid}/envs`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({ key: "BUBBLBOOK_SPA_URL", value: SPA, is_preview: false, is_build_time: false, is_literal: true }),
    });
    console.log("coolify POST BUBBLBOOK_SPA_URL");
  }

  const srv = await fetch(`${base}/api/v1/servers/rorxx790bkr8db4ssro9v5fh`, { headers: h }).then((r) => r.json());
  const keys = await fetch(`${base}/api/v1/security/keys`, { headers: h }).then((r) => r.json());
  const kid = srv.private_key_uuid || srv.private_key_id;
  const pk = keys.find((k) => k.uuid === kid || k.id === kid)?.private_key;
  const keyPath = join(tmpdir(), "k");
  await writeFile(keyPath, pk, { mode: 0o600 });

  const cmd = [
    `cd ${ROOT}`,
    "grep -v '^BUBBLBOOK_SPA_URL=' .env > .env.tmp && mv .env.tmp .env",
    "sed -i 's/^HOST=0\\.0\\.0\\.0BUBBLBOOK_SPA_URL=.*/HOST=0.0.0.0/' .env",
    `printf '\\nBUBBLBOOK_SPA_URL=${SPA}\\n' >> .env`,
    "grep -E '^(HOST|BUBBLBOOK_SPA_URL)=' .env",
    "sudo -E docker compose -f docker-compose.yml -f docker-compose.mcp.yml up -d --force-recreate mcp",
    "APP=$(docker ps --format '{{.Names}}' | grep '^app-gacc5' | head -1)",
    'docker network connect gacc5qlsha4e9nrqk1vf58b3_default "$APP" 2>/dev/null || true',
    'docker network connect gacc5qlsha4e9nrqk1vf58b3 mcp-server 2>/dev/null || true',
    "docker exec mcp-server env | grep BUBBLBOOK_SPA_URL",
    `cd ${ROOT} && docker compose -f docker-compose.yml -f docker-compose.mcp.yml config 2>/dev/null | grep BUBBLBOOK_SPA_URL | head -3`,
  ].join("; ");

  const { stdout } = await execFileAsync("ssh", ["-i", keyPath, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", `ubuntu@${srv.ip}`, cmd], { timeout: 120000 });
  console.log(stdout);
  await unlink(keyPath);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
