/** Discover where Stripe config lives on production (no secret values). */
const { execFile } = require("child_process");
const { promisify } = require("util");
const { writeFile, unlink } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");
const { randomBytes } = require("crypto");
const execFileAsync = promisify(execFile);
const SERVER_UUID = "ray76gl90ckl5iur3fk2zgvt";

async function main() {
  const token = process.env.COOLIFY_API_TOKEN;
  const base = process.env.COOLIFY_API_URL.replace(/\/$/, "");
  const h = { Authorization: `Bearer ${token}` };
  const srv = await fetch(`${base}/api/v1/servers/${SERVER_UUID}`, { headers: h }).then((r) => r.json());
  const keys = await fetch(`${base}/api/v1/security/keys`, { headers: h }).then((r) => r.json());
  const kid = srv.private_key_uuid || srv.private_key_id;
  const pk = keys.find((k) => k.uuid === kid || k.id === kid)?.private_key;
  const user = srv.user || "ubuntu";
  const target = `${user}@${srv.ip}`;
  const port = String(srv.port || 22);

  const cmd = [
    "echo '=== pm2 list ==='",
    "pm2 list 2>/dev/null || true",
    "echo '=== pm2 env keys matching stripe/STRIPE ==='",
    "for i in $(seq 0 9); do pm2 env \"$i\" 2>/dev/null | grep -i stripe | sed 's/=.*/=<redacted>/' || true; done",
    "echo '=== grep stripe in home (filenames only) ==='",
    "grep -ril stripe /home/ubuntu 2>/dev/null | head -30 || true",
    "echo '=== .secret / .env paths ==='",
    "find /home/ubuntu -maxdepth 8 \\( -name '.secret' -o -name '.env' -o -name 'ecosystem*.js' -o -name 'ecosystem*.json' \\) 2>/dev/null | head -40",
    "echo '=== stripe key names in secret files ==='",
    "for f in $(find /home/ubuntu -maxdepth 8 \\( -name '.secret' -o -name '.env' \\) 2>/dev/null); do",
    "  hits=$(grep -i stripe \"$f\" 2>/dev/null | sed 's/=.*/=<redacted>/' | head -5)",
    "  if [ -n \"$hits\" ]; then echo \"--- $f ---\"; echo \"$hits\"; fi",
    "done",
    "echo '=== /var/www ==='",
    "find /var/www -maxdepth 6 \\( -name '.secret' -o -name '.env' \\) 2>/dev/null | head -20",
    "for f in $(find /var/www -maxdepth 6 \\( -name '.secret' -o -name '.env' \\) 2>/dev/null); do",
    "  hits=$(grep -i stripe \"$f\" 2>/dev/null | sed 's/=.*/=<redacted>/' | head -5)",
    "  if [ -n \"$hits\" ]; then echo \"--- $f ---\"; echo \"$hits\"; fi",
    "done",
  ].join("\n");

  const keyPath = join(tmpdir(), `d-${randomBytes(4).toString("hex")}`);
  await writeFile(keyPath, pk, { mode: 0o600 });
  try {
    const { stdout } = await execFileAsync(
      "ssh",
      ["-i", keyPath, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", "-p", port, target, cmd],
      { timeout: 120_000, maxBuffer: 8 * 1024 * 1024 }
    );
    console.log(stdout);
  } finally {
    await unlink(keyPath).catch(() => undefined);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
