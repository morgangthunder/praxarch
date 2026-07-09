/**
 * ECR off-box deploy: build on staging → push ECR → bridge cutover on prod.
 *
 * Usage:
 *   node ecr-build-push-cutover.js probe
 *   node ecr-build-push-cutover.js build-start    # background build on staging
 *   node ecr-build-push-cutover.js build-poll
 *   node ecr-build-push-cutover.js push           # tag + push to ECR
 *   node ecr-build-push-cutover.js cutover        # prod bridge + ECR v2
 *   node ecr-build-push-cutover.js smoke
 */
const { execFile } = require("child_process");
const { promisify } = require("util");
const { writeFile, unlink } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");
const execFileAsync = promisify(execFile);

const ECR = "435214896413.dkr.ecr.eu-west-1.amazonaws.com/bubblbook/prod";
const ECR_TAG = process.env.ECR_TAG || "v2";
const REGION = "eu-west-1";

const STAGING = {
  uuid: "rorxx790bkr8db4ssro9v5fh",
  ip: "99.81.24.250",
  root: "/data/coolify/applications/gacc5qlsha4e9nrqk1vf58b3",
};
const PROD = {
  uuid: "ray76gl90ckl5iur3fk2zgvt",
  ip: "34.251.139.131",
  root: "/data/coolify/applications/nf6adysipbutbwzslufhhoqg",
};

const BUILD_LOG = "/tmp/bubblbook-ecr-build.log";
const BUILD_DONE = "/tmp/bubblbook-ecr-build.done";
const CUTOVER_DONE = "/tmp/bubblbook-ecr-cutover.done";

async function getSshKey(serverUuid) {
  const token = process.env.COOLIFY_API_TOKEN;
  const base = (process.env.COOLIFY_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
  const h = { Authorization: `Bearer ${token}` };
  const srv = await fetch(`${base}/api/v1/servers/${serverUuid}`, { headers: h }).then((r) => r.json());
  const keys = await fetch(`${base}/api/v1/security/keys`, { headers: h }).then((r) => r.json());
  const kid = srv.private_key_uuid || srv.private_key_id;
  const pk = keys.find((k) => k.uuid === kid || k.id === kid)?.private_key;
  if (!pk) throw new Error(`SSH key unavailable for ${serverUuid}`);
  return pk;
}

async function ssh(pk, ip, cmd, timeout = 300000) {
  const keyPath = join(tmpdir(), `ecr-${Date.now()}.key`);
  await writeFile(keyPath, pk, { mode: 0o600 });
  try {
    const { stdout, stderr } = await execFileAsync(
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
        "-o",
        "ConnectTimeout=30",
        "-o",
        "ServerAliveInterval=30",
        `ubuntu@${ip}`,
        `bash -lc '${cmd.replace(/'/g, "'\\''")}'`,
      ],
      { timeout, maxBuffer: 16 * 1024 * 1024 }
    );
    return (stdout || "") + (stderr || "");
  } finally {
    await unlink(keyPath).catch(() => undefined);
  }
}

function buildRemoteBuildScript() {
  const imageLocal = `bubblbook-ecr-build:${ECR_TAG}`;
  return [
    "#!/bin/bash",
    "set -e",
    `cd ${STAGING.root}`,
    "echo '=== git ==='",
    "git fetch origin",
    "git checkout master",
    "git pull --ff-only origin master",
    "COMMIT=$(git rev-parse --short HEAD)",
    'echo "commit=$COMMIT"',
    "echo '=== docker build (Dockerfile with scripts + build not prerender) ==='",
    "grep -q 'COPY Front-end/scripts' Dockerfile || sed -i '/COPY Front-end\\/package/a COPY Front-end/scripts ./scripts' Dockerfile",
    "grep -q 'npm run build' Dockerfile || sed -i 's/npm run prerender/npm run build/' Dockerfile",
    "export DOCKER_BUILDKIT=1",
    `sudo -E docker build -t ${imageLocal} -f Dockerfile . 2>&1`,
    `echo "${imageLocal} commit=$COMMIT" > ${BUILD_DONE}`,
    "echo BUILD_OK",
  ].join("\n");
}

function buildPushScript() {
  const imageLocal = `bubblbook-ecr-build:${ECR_TAG}`;
  return [
    "#!/bin/bash",
    "set -e",
    `test -f ${BUILD_DONE} || { echo BUILD_NOT_DONE; exit 1; }`,
    `COMMIT=$(cat ${BUILD_DONE} | awk '{print $2}' | cut -d= -f2)`,
    'echo "pushing commit=$COMMIT"',
    `aws ecr get-login-password --region ${REGION} | sudo docker login --username AWS --password-stdin 435214896413.dkr.ecr.${REGION}.amazonaws.com`,
    `sudo docker tag ${imageLocal} ${ECR}:${ECR_TAG}`,
    `sudo docker tag ${imageLocal} ${ECR}:$COMMIT`,
    `sudo docker push ${ECR}:${ECR_TAG}`,
    `sudo docker push ${ECR}:$COMMIT`,
    "echo PUSH_OK",
  ].join("\n");
}

async function ecrLoginProd(pkProd) {
  const { execFileSync } = require("child_process");
  const password = execFileSync(
    "aws",
    ["ecr", "get-login-password", "--region", REGION],
    { encoding: "utf8" }
  ).trim();
  const loginCmd = `echo '${password.replace(/'/g, "'\\''")}' | sudo docker login --username AWS --password-stdin 435214896413.dkr.ecr.${REGION}.amazonaws.com`;
  console.log("=== ECR login on prod (from local AWS) ===");
  console.log(await ssh(pkProd, PROD.ip, loginCmd, 120000));
}

function buildCutoverScript() {
  const overlay = `services:
  app:
    image: ${ECR}:${ECR_TAG}
`;
  const overlayB64 = Buffer.from(overlay).toString("base64");
  return [
    "#!/bin/bash",
    "set -e",
    `cd ${PROD.root}`,
    "echo '=== 1. bridge env ==='",
    "for f in Back-end/.secret .env; do",
    '  [ -f "$f" ] || continue',
    '  sed -i "s|^MONGO_URI=.*|MONGO_URI=mongodb://mongo:27017/bubblbook|" "$f"',
    '  sed -i "s|^REDIS_HOST=.*|REDIS_HOST=redis|" "$f"',
    '  sed -i "s|^REDIS_PORT=.*|REDIS_PORT=6379|" "$f"',
    '  grep -q "^ONBOARDING_AGENT_MCP_URL=" "$f" && sed -i "s|^ONBOARDING_AGENT_MCP_URL=.*|ONBOARDING_AGENT_MCP_URL=http://mcp:3400|" "$f" || echo "ONBOARDING_AGENT_MCP_URL=http://mcp:3400" >> "$f"',
    "done",
    "grep -E '^(MONGO_URI|REDIS_|ONBOARDING)' Back-end/.secret | sed 's/=.*$/=***/'",
    "echo '=== 2. ECR overlay (no host network, no build) ==='",
    `echo '${overlayB64}' | base64 -d > docker-compose.praxarch-build.yml`,
    "cat docker-compose.praxarch-build.yml",
    "echo '=== 3. patch base compose image pin ==='",
    `sed -i 's|image:.*bubblbook/prod:.*|image: ${ECR}:${ECR_TAG}|' docker-compose.yml`,
    "grep -E 'image:|ports:' docker-compose.yml | head -6",
    "echo '=== 4. pull ECR image ==='",
    `sudo docker pull ${ECR}:${ECR_TAG}`,
    "echo '=== 5. ensure mongo/redis up ==='",
    "sudo docker compose -f docker-compose.yml up -d mongo redis",
    "echo '=== 6. up app + mcp (bridge) ==='",
    "sudo docker compose -f docker-compose.yml -f docker-compose.praxarch-build.yml -f docker-compose.mcp.yml up -d --force-recreate app mcp",
    "echo '=== 7. MCP network join ==='",
    'APP=$(docker ps --format "{{.Names}}" | grep -E "^(app-|work-)" | head -1)',
    'MCP_NET=$(docker inspect mcp-server --format "{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}" 2>/dev/null | awk "{print \\$1}")',
    'APP_NET=$(docker inspect "$APP" --format "{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}" 2>/dev/null | awk "{print \\$1}")',
    'test -n "$APP" && test -n "$MCP_NET" && docker network inspect "$MCP_NET" --format "{{range .Containers}}{{.Name}} {{end}}" | grep -q "$APP" || docker network connect "$MCP_NET" "$APP" 2>/dev/null || true',
    'test -n "$APP_NET" && docker network inspect "$APP_NET" --format "{{range .Containers}}{{.Name}} {{end}}" | grep -q mcp-server || docker network connect "$APP_NET" mcp-server 2>/dev/null || true',
    "sleep 12",
    "echo '=== 8. smoke ==='",
    "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'",
    'docker exec "$APP" printenv MONGO_URI REDIS_HOST REDIS_PORT ONBOARDING_AGENT_MCP_URL 2>/dev/null | sed "s|://[^@]*@|://***@|"',
    "docker exec mongo-latest mongosh --quiet bubblbook --eval 'print(\"users=\"+db.users.countDocuments())'",
    "curl -sf -o /dev/null -w 'root3300=%{http_code}\\n' http://127.0.0.1:3300/",
    "curl -sf -o /dev/null -w 'agree3300=%{http_code}\\n' http://127.0.0.1:3300/app/g/agreeatime",
    "curl -sk -o /dev/null -w 'https_root=%{http_code}\\n' https://bubblbook.com/",
    "curl -sk -o /dev/null -w 'https_agree=%{http_code}\\n' https://bubblbook.com/app/g/agreeatime",
    "docker run --rm --network host mongo:7 mongosh 'mongodb://127.0.0.1:27018/bubblbook' --quiet --eval 'print(\"ext27018_users=\"+db.users.countDocuments())'",
    `echo OK > ${CUTOVER_DONE}`,
    "echo CUTOVER_OK",
  ].join("\n");
}

function buildSmokeScript() {
  return [
    "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'",
    'APP=$(docker ps --format "{{.Names}}" | grep -E "^(app-|work-)" | head -1)',
    'echo app=$APP',
    'docker exec "$APP" printenv MONGO_URI REDIS_HOST 2>/dev/null | sed "s|://[^@]*@|://***@|"',
    "docker exec mongo-latest mongosh --quiet bubblbook --eval 'print(\"users=\"+db.users.countDocuments())'",
    "curl -sf -o /dev/null -w 'root3300=%{http_code}\\n' http://127.0.0.1:3300/",
    "curl -sk -o /dev/null -w 'https=%{http_code}\\n' https://bubblbook.com/",
    "curl -sk -o /dev/null -w 'agree=%{http_code}\\n' https://bubblbook.com/app/g/agreeatime",
    `test -f ${CUTOVER_DONE} && echo CUTOVER_DONE=yes || echo CUTOVER_DONE=no`,
  ].join("; ");
}

async function probe(pkStaging, pkProd) {
  const probeCmd = (root) =>
    [
      "echo '=== disk ==='",
      "df -h / | tail -1",
      "echo '=== git ==='",
      `cd ${root} && git rev-parse --short HEAD && git branch --show-current`,
      "echo '=== compose ==='",
      `grep -E 'image:|build:' ${root}/docker-compose.yml | head -4`,
      "echo '=== aws ==='",
      "which aws && aws --version 2>&1 | head -1 || echo no_aws",
      "aws sts get-caller-identity 2>&1 | head -3 || true",
      "echo '=== docker ==='",
      "docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}' | head -6",
    ].join("; ");

  console.log("=== STAGING ===\n" + (await ssh(pkStaging, STAGING.ip, probeCmd(STAGING.root), 120000)));
  console.log("=== PROD ===\n" + (await ssh(pkProd, PROD.ip, probeCmd(PROD.root), 120000)));
}

async function startBuild(pk) {
  const script = buildRemoteBuildScript();
  const b64 = Buffer.from(script).toString("base64");
  const start = [
    `rm -f ${BUILD_DONE} ${BUILD_LOG}`,
    `echo '${b64}' | base64 -d > /tmp/ecr-build.sh`,
    "chmod +x /tmp/ecr-build.sh",
    `nohup /tmp/ecr-build.sh > ${BUILD_LOG} 2>&1 </dev/null & disown`,
    "sleep 2",
    "echo BUILD_STARTED",
    `tail -5 ${BUILD_LOG} 2>/dev/null || true`,
  ].join("; ");
  console.log(await ssh(pk, STAGING.ip, start, 90000));
}

async function pollBuild(pk) {
  console.log(
    await ssh(
      pk,
      STAGING.ip,
      `test -f ${BUILD_DONE} && echo DONE || echo RUNNING; df -h / | tail -1; tail -25 ${BUILD_LOG} 2>/dev/null || echo no_log`,
      120000
    )
  );
}

async function push(pk) {
  const script = buildPushScript();
  const b64 = Buffer.from(script).toString("base64");
  console.log(await ssh(pk, STAGING.ip, `echo '${b64}' | base64 -d | bash`, 600000));
}

async function cutover(pk) {
  const script = buildCutoverScript();
  const b64 = Buffer.from(script).toString("base64");
  console.log(await ssh(pk, PROD.ip, `echo '${b64}' | base64 -d | bash`, 600000));
}

async function smoke(pk) {
  console.log(await ssh(pk, PROD.ip, buildSmokeScript(), 120000));
}

async function main() {
  const mode = process.argv[2] || "probe";
  const pkStaging = await getSshKey(STAGING.uuid);
  const pkProd = await getSshKey(PROD.uuid);

  if (mode === "probe") return probe(pkStaging, pkProd);
  if (mode === "build-start") return startBuild(pkStaging);
  if (mode === "build-poll") return pollBuild(pkStaging);
  if (mode === "push") return push(pkStaging);
  if (mode === "cutover") {
    await ecrLoginProd(pkProd);
    return cutover(pkProd);
  }
  if (mode === "smoke") return smoke(pkProd);
  if (mode === "all") {
    await probe(pkStaging, pkProd);
    await startBuild(pkStaging);
    console.log("\nPoll with: node ecr-build-push-cutover.js build-poll");
    return;
  }
  throw new Error(`Unknown mode: ${mode}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
