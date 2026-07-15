/**
 * Persist Google Sheets / Maps env vars in Coolify's DB (survives redeploys),
 * ensure gsheets JSON on host, then restart the app via Coolify API.
 *
 * Usage: node scripts/ensure-gsheets-coolify-env.js staging|production
 */
const { execFile } = require("child_process");
const { promisify } = require("util");
const { writeFile, unlink } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");
const execFileAsync = promisify(execFile);

const SHEET_ID = "15y4H4z1eFYQjL2KDsu7CLkbJgz08EzllEgSwJfgE8Bs";

const TARGETS = {
  staging: {
    appUuid: "gacc5qlsha4e9nrqk1vf58b3",
    serverUuid: "rorxx790bkr8db4ssro9v5fh",
    root: "/data/coolify/applications/gacc5qlsha4e9nrqk1vf58b3",
    appNamePattern: "^app-gacc",
  },
  production: {
    appUuid: "nf6adysipbutbwzslufhhoqg",
    serverUuid: "ray76gl90ckl5iur3fk2zgvt",
    root: "/data/coolify/applications/nf6adysipbutbwzslufhhoqg",
    appNamePattern: "^app-nf6adysip",
  },
};

const PROD_ROOT = TARGETS.production.root;
const PROD_SERVER = TARGETS.production.serverUuid;

const BASE_VARS = {
  GOOGLE_SHEETS_KEY_FILE: "config/gsheets-service-account.json",
  GOOGLE_SHEETS_SPREADSHEET_ID: SHEET_ID,
};

async function ssh(pk, ip, cmd, timeout = 180_000) {
  const kp = join(tmpdir(), `k-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await writeFile(kp, pk, { mode: 0o600 });
  try {
    const { stdout, stderr } = await execFileAsync(
      "ssh",
      [
        "-i",
        kp,
        "-o",
        "BatchMode=yes",
        "-o",
        "StrictHostKeyChecking=accept-new",
        "-o",
        "UserKnownHostsFile=NUL",
        "-o",
        "ConnectTimeout=15",
        `ubuntu@${ip}`,
        cmd,
      ],
      { timeout, maxBuffer: 4 * 1024 * 1024 }
    );
    return { stdout, stderr };
  } finally {
    await unlink(kp).catch(() => undefined);
  }
}

async function getPrivateKey(base, h, serverUuid) {
  const keysRaw = await fetch(`${base}/api/v1/security/keys`, { headers: h }).then((r) => r.json());
  const keys = Array.isArray(keysRaw) ? keysRaw : keysRaw.data ?? [];
  const srv = await fetch(`${base}/api/v1/servers/${serverUuid}`, { headers: h }).then((r) => r.json());
  const kid = srv.private_key_uuid || srv.private_key_id;
  const pk = keys.find((k) => k.uuid === kid || k.id === kid)?.private_key;
  if (!pk) throw new Error(`SSH key not found for server ${serverUuid}`);
  return pk;
}

async function listCoolifyEnvs(base, h, appUuid) {
  const raw = await fetch(`${base}/api/v1/applications/${appUuid}/envs`, { headers: h }).then((r) => r.json());
  return Array.isArray(raw) ? raw : raw.data ?? [];
}

async function upsertCoolifyEnv(base, h, appUuid, key, value) {
  const existing = (await listCoolifyEnvs(base, h, appUuid)).find((e) => e.key === key);
  const body = {
    key,
    value,
    is_preview: false,
    is_literal: true,
    is_multiline: false,
    is_shown_once: false,
  };
  if (existing?.uuid) {
    const res = await fetch(`${base}/api/v1/applications/${appUuid}/envs/${existing.uuid}`, {
      method: "PATCH",
      headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`PATCH ${key} failed: ${res.status} ${await res.text()}`);
    return "PATCH";
  }
  const res = await fetch(`${base}/api/v1/applications/${appUuid}/envs`, {
    method: "POST",
    headers: { ...h, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${key} failed: ${res.status} ${await res.text()}`);
  return "POST";
}

async function readMapsKeyFromProd(prodPk, prodIp) {
  const readProd = [
    `grep -h "^GOOGLE_MAPS_API_KEY=" ${PROD_ROOT}/.env ${PROD_ROOT}/Back-end/.secret 2>/dev/null | head -1`,
    `APP=$(docker ps --format '{{.Names}}' | grep -E '^app-nf6adysip' | head -1)`,
    `[ -n "$APP" ] && docker exec "$APP" printenv GOOGLE_MAPS_API_KEY 2>/dev/null || true`,
  ].join("\n");
  const lines = (await ssh(prodPk, prodIp, readProd)).stdout.trim().split("\n").filter(Boolean);
  const fromEnv = lines.find((l) => l.startsWith("GOOGLE_MAPS_API_KEY="));
  const fromContainer = lines.find((l) => !l.includes("="));
  return (fromEnv ? fromEnv.slice("GOOGLE_MAPS_API_KEY=".length) : fromContainer || "").trim();
}

async function ensureGsheetsJsonOnHost(pk, ip, root, copyFromProdPk, copyFromProdIp) {
  const gsheetsHost = `${root}/Back-end/config/gsheets-service-account.json`;
  const check = (await ssh(pk, ip, `test -f '${gsheetsHost}' && echo OK || echo MISSING`)).stdout.trim();
  if (check.includes("OK")) return;
  console.log(`Gsheets JSON missing at ${gsheetsHost} — copying from prod...`);
  const b64 = (await ssh(copyFromProdPk, copyFromProdIp, `base64 -w0 '${PROD_ROOT}/Back-end/config/gsheets-service-account.json'`)).stdout.trim();
  await ssh(
    pk,
    ip,
    [
      `mkdir -p '${root}/Back-end/config'`,
      `echo '${b64}' | base64 -d > '${gsheetsHost}'`,
      `chmod 600 '${gsheetsHost}'`,
      "echo GSHEETS_COPIED",
    ].join("\n")
  );
}

async function verifyContainer(pk, ip, appPattern) {
  const remote = [
    `APP=$(docker ps --format '{{.Names}}' | grep -E '${appPattern}' | head -1)`,
    'echo app=$APP',
    'docker exec "$APP" printenv GOOGLE_SHEETS_KEY_FILE GOOGLE_SHEETS_SPREADSHEET_ID GOOGLE_MAPS_API_KEY | sed "s/=.*$/=<set>/"',
    'docker exec "$APP" ls -la /app/config/gsheets-service-account.json 2>&1',
    `docker exec -w /app "$APP" node -e "const g=require('./config/google.apis'); g.auth().then(()=>console.log('auth_ok')).catch(e=>console.error('auth_err', e.message));"`,
  ].join("\n");
  return (await ssh(pk, ip, remote, 120_000)).stdout.trim();
}

async function main() {
  const envName = (process.argv[2] || "staging").toLowerCase();
  const target = TARGETS[envName];
  if (!target) throw new Error(`Unknown target "${envName}" — use staging or production`);

  const token = process.env.COOLIFY_API_TOKEN;
  if (!token) throw new Error("COOLIFY_API_TOKEN is not set");
  const base = (process.env.COOLIFY_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
  const h = { Authorization: `Bearer ${token}` };

  const prodPk = await getPrivateKey(base, h, PROD_SERVER);
  const prodIp = await fetch(`${base}/api/v1/servers/${PROD_SERVER}`, { headers: h })
    .then((r) => r.json())
    .then((s) => s.ip);
  const pk = await getPrivateKey(base, h, target.serverUuid);
  const ip = await fetch(`${base}/api/v1/servers/${target.serverUuid}`, { headers: h })
    .then((r) => r.json())
    .then((s) => s.ip);

  await ensureGsheetsJsonOnHost(pk, ip, target.root, prodPk, prodIp);

  const mapsKey = await readMapsKeyFromProd(prodPk, prodIp);
  if (!mapsKey) throw new Error("Could not read GOOGLE_MAPS_API_KEY from prod");

  const vars = { ...BASE_VARS, GOOGLE_MAPS_API_KEY: mapsKey };
  console.log(`=== Syncing ${Object.keys(vars).length} vars to Coolify API (${envName}) ===`);
  for (const [key, value] of Object.entries(vars)) {
    const action = await upsertCoolifyEnv(base, h, target.appUuid, key, value);
    console.log(`coolify ${action} ${key}`);
  }

  console.log(`=== Deploying ${envName} via Coolify API (regenerates .env from DB) ===`);
  const deploy = await fetch(`${base}/api/v1/deploy?uuid=${target.appUuid}&force=false`, {
    method: "GET",
    headers: h,
  });
  if (!deploy.ok) {
    await fetch(`${base}/api/v1/deploy?uuid=${target.appUuid}&force=false`, {
      method: "POST",
      headers: h,
    }).then(async (r) => {
      if (!r.ok) throw new Error(`Coolify deploy failed: ${r.status} ${await r.text()}`);
    });
  }
  console.log("coolify deploy triggered — waiting 45s then force-recreating app...");
  await new Promise((r) => setTimeout(r, 45_000));

  const recreate = [
    `grep -E '^(GOOGLE_SHEETS|GOOGLE_MAPS)' ${target.root}/.env | sed 's/=.*$/=<set>/' || echo 'WARN: google vars not yet in .env'`,
    `cd "${target.root}"`,
    "sudo docker compose -f docker-compose.yml up -d --force-recreate app",
    "sleep 12",
  ].join("\n");
  console.log((await ssh(pk, ip, recreate)).stdout.trim());

  console.log(`=== Verify ${envName} container ===`);
  console.log(await verifyContainer(pk, ip, target.appNamePattern));

  const coolifyKeys = (await listCoolifyEnvs(base, h, target.appUuid))
    .filter((e) => /GOOGLE_SHEETS|GOOGLE_MAPS/.test(e.key))
    .map((e) => e.key);
  console.log(`\nCoolify DB now has: ${coolifyKeys.join(", ") || "(none)"}`);
  console.log("\nThese vars will survive the next Coolify redeploy.");
}

main().catch((e) => {
  console.error("ERR", e.message);
  if (e.stdout) console.log(String(e.stdout).trim());
  process.exit(1);
});
