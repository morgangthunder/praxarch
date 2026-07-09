/**
 * Pull live Stripe env vars from production ecosystem.config.js over SSH.
 * Writes scripts/bubblbook-production-stripe.env.local (gitignored).
 */
const { execFile } = require("child_process");
const { promisify } = require("util");
const { writeFile, unlink } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");
const { randomBytes } = require("crypto");

const execFileAsync = promisify(execFile);
const SERVER_UUID = "ray76gl90ckl5iur3fk2zgvt";
const ECOSYSTEM_PATH = "/home/ubuntu/apps/ecosystem.config.js";
const EXTRA_PATHS = [
  "/home/ubuntu/apps/master/bubbl_book/Back-end/.env",
  "/home/ubuntu/apps/master/bubbl_book/Back-end/.secret",
];
const STRIPE_KEYS = [
  "stripe_pb_key",
  "stripe_key",
  "stripe_subscription_prod_id",
  "stripe_subscription_price_id",
  "stripe_wh_key",
  "stripe_wh_signing_secret",
];

const PY = `
import re, sys
out = {}
eco = open("${ECOSYSTEM_PATH}").read()
for key in set(re.findall(r"(stripe_[a-z_]+)\\s*:", eco)):
    m = re.search(rf"{re.escape(key)}\\s*:\\s*['\\\"]([^'\\\"]+)", eco)
    if m:
        out[key] = m.group(1)
for path in ${JSON.stringify(EXTRA_PATHS)}:
    try:
        for line in open(path):
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k, v = k.strip(), v.strip()
            if k.startswith("stripe_") and v:
                out[k] = v
    except OSError:
        pass
for k in sorted(out):
    print(f"{k}={out[k]}")
`;

async function getSshTarget() {
  const token = process.env.COOLIFY_API_TOKEN;
  const base = (process.env.COOLIFY_API_URL || "").replace(/\/$/, "");
  if (!token || !base) throw new Error("COOLIFY_API_TOKEN and COOLIFY_API_URL required");

  const headers = { Authorization: `Bearer ${token}` };
  const srv = await fetch(`${base}/api/v1/servers/${SERVER_UUID}`, { headers }).then((r) => r.json());
  const keys = await fetch(`${base}/api/v1/security/keys`, { headers }).then((r) => r.json());
  const kid = srv.private_key_uuid || srv.private_key_id;
  const privateKey = keys.find((k) => k.uuid === kid || k.id === kid)?.private_key;
  if (!privateKey) throw new Error("Coolify SSH private key not found");

  return {
    privateKey,
    sshTarget: `${srv.user || "ubuntu"}@${srv.ip}`,
    port: String(srv.port || 22),
  };
}

async function ssh(privateKey, sshTarget, port, command) {
  const keyPath = join(tmpdir(), `pull-stripe-${randomBytes(4).toString("hex")}`);
  await writeFile(keyPath, privateKey, { mode: 0o600 });
  try {
    const { stdout } = await execFileAsync(
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
        port,
        sshTarget,
        command,
      ],
      { timeout: 90_000, maxBuffer: 4 * 1024 * 1024 }
    );
    return stdout;
  } finally {
    await unlink(keyPath).catch(() => undefined);
  }
}

function parseStripeLines(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!STRIPE_KEYS.includes(key) || !value) continue;
    out[key] = value;
  }
  return out;
}

function mask(value) {
  if (!value || value.length < 10) return "(short)";
  return `${value.slice(0, 7)}…${value.slice(-4)}`;
}

async function main() {
  const { privateKey, sshTarget, port } = await getSshTarget();
  const b64 = Buffer.from(PY).toString("base64");
  const raw = await ssh(privateKey, sshTarget, port, `bash -lc 'echo ${b64} | base64 -d | python3'`);
  const vars = parseStripeLines(raw);

  const outPath = process.env.OUT_PATH || join(__dirname, "bubblbook-production-stripe.env.local");
  const lines = [
    "# Pulled from live production PM2 ecosystem.config.js on " + new Date().toISOString().slice(0, 10),
    "# Gitignored — do not commit",
    "# Note: legacy prod only defines stripe_key; other keys may need Stripe Dashboard (live mode).",
    "",
  ];
  for (const key of STRIPE_KEYS) {
    lines.push(`${key}=${vars[key] ?? ""}`);
  }
  lines.push("");
  await writeFile(outPath, lines.join("\n"), { mode: 0o600 });

  console.log("Wrote:", outPath);
  for (const key of STRIPE_KEYS) {
    const v = vars[key];
    console.log(`  ${key}: ${v ? mask(v) : "MISSING"}`);
  }

  const found = STRIPE_KEYS.filter((k) => vars[k]);
  if (!found.length) {
    console.error("No stripe keys found on production server.");
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
