/** Read-only: find where bubblbook LLM keys exist (names/lengths only). */
const { execFile } = require("child_process");
const { promisify } = require("util");
const { writeFile, unlink } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");
const { randomBytes } = require("crypto");
const execFileAsync = promisify(execFile);

async function ssh(srv, pk, cmd) {
  const keyPath = join(tmpdir(), `p-${randomBytes(4).toString("hex")}`);
  await writeFile(keyPath, pk, { mode: 0o600 });
  try {
    const { stdout } = await execFileAsync(
      "ssh",
      ["-i", keyPath, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", "-p", String(srv.port || 22), `${srv.user || "root"}@${srv.ip}`, cmd],
      { timeout: 60000, maxBuffer: 2 * 1024 * 1024 }
    );
    return stdout;
  } finally {
    await unlink(keyPath).catch(() => undefined);
  }
}

async function getPk(serverUuid) {
  const token = process.env.COOLIFY_API_TOKEN;
  const base = process.env.COOLIFY_API_URL.replace(/\/$/, "");
  const h = { Authorization: `Bearer ${token}` };
  const srv = await fetch(`${base}/api/v1/servers/${serverUuid}`, { headers: h }).then((r) => r.json());
  const keys = await fetch(`${base}/api/v1/security/keys`, { headers: h }).then((r) => r.json());
  const kid = srv.private_key_uuid || srv.private_key_id;
  const pk = keys.find((k) => k.uuid === kid || k.id === kid)?.private_key;
  if (!pk) throw new Error(`no ssh key for ${serverUuid}`);
  return { srv, pk };
}

function reportSecretFile(label, text) {
  const keys = ["LLM_PROVIDER", "GEMINI_API_KEY", "GOOGLE_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "ONBOARDING_AGENT_MCP_URL"];
  console.log(`\n=== ${label} ===`);
  for (const k of keys) {
    const m = text.match(new RegExp(`^${k}=(.*)$`, "m"));
    if (!m) {
      console.log(`  ${k}: (not set)`);
      continue;
    }
    const v = m[1].trim();
    console.log(`  ${k}: ${v ? `set (len ${v.length})` : "empty"}`);
  }
}

async function main() {
  // Staging coolify .env
  const st = await getPk("rorxx790bkr8db4ssro9v5fh");
  const stagingEnv = await ssh(st.srv, st.pk, "cat /data/coolify/applications/gacc5qlsha4e9nrqk1vf58b3/.env 2>/dev/null | grep -E '^(LLM_|GEMINI|GOOGLE_API|OPENAI|ANTHROPIC|ONBOARDING)' || echo '(no llm keys in coolify .env)'");
  console.log("Staging Coolify .env LLM lines (redacted values shown as set/empty):");
  for (const line of stagingEnv.trim().split("\n")) {
    const eq = line.indexOf("=");
    if (eq < 1) { console.log(" ", line); continue; }
    const k = line.slice(0, eq);
    const v = line.slice(eq + 1).trim();
    console.log(`  ${k}=${v ? `[len ${v.length}]` : "empty"}`);
  }

  const stagingSecret = await ssh(st.srv, st.pk, "cat /data/coolify/applications/gacc5qlsha4e9nrqk1vf58b3/Back-end/.secret 2>/dev/null || echo ''");
  reportSecretFile("Staging Back-end/.secret", stagingSecret);

  // Production PM2 / legacy paths (read-only)
  const prod = await getPk("ray76gl90ckl5iur3fk2zgvt");
  const prodProbe = await ssh(
    prod.srv,
    prod.pk,
    [
      "echo '=== prod .secret paths ==='",
      "for f in /home/ubuntu/apps/staging/bubbl_book/Back-end/.secret /home/ubuntu/apps/bubbl_book/Back-end/.secret /home/ubuntu/bubbl_book/Back-end/.secret; do",
      "  test -f \"$f\" && echo \"found $f\" && grep -E '^(LLM_PROVIDER|GEMINI|GOOGLE_API|OPENAI|ANTHROPIC)=' \"$f\" | sed 's/=.*/=REDACTED/' || true",
      "done",
      "echo '=== pm2 env llm key names ==='",
      "pm2 jlist 2>/dev/null | head -c 50000 | grep -oE '(GEMINI|OPENAI|ANTHROPIC|LLM_PROVIDER)[^\"]*' | head -5 || pm2 env 0 2>/dev/null | grep -E 'LLM|GEMINI|OPENAI|ANTHROPIC' | sed 's/=.*/=REDACTED/' | head -10 || echo 'pm2 not available'",
    ].join("; ")
  );
  console.log(prodProbe);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
