import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { CoolifyApiClient } from "./coolify-api.client";
import { CoolifyServersService } from "./coolify-servers.service";
import { DeployTargetsService } from "./deploy-targets.service";
import { resolveProfileOptions } from "./compose-build-profiles";
import { runSshCommand } from "./remote-ssh.util";

export type PostDeployResult = { ok: true } | { ok: false; error: string };

/** Remote fixes after a successful Coolify compose deploy (tenant-specific hooks). */
@Injectable()
export class ProdPostDeployService {
  private readonly logger = new Logger(ProdPostDeployService.name);

  constructor(
    private readonly deployTargets: DeployTargetsService,
    private readonly coolify: CoolifyApiClient,
    private readonly servers: CoolifyServersService
  ) {}

  /**
   * Run post-deploy hooks when Coolify reports success.
   * Returns ok:false if mongo verification fails (e.g. empty database).
   */
  async afterCoolifySuccess(
    tenantId: string,
    serviceId: string,
    environment: "staging" | "production",
    options?: { expectedCommitSha?: string }
  ): Promise<PostDeployResult> {
    const target = await this.deployTargets.get(tenantId, serviceId, environment);
    if (!target?.coolifyAppUuid || !target.coolifyServerUuid) return { ok: true };

    const opts = resolveProfileOptions(target.deployProfileOptions);
    const mongoVol = opts.mongoDataVolume?.trim();
    const runRegionSeed = serviceId === "bubblbook";
    const expectedCommitSha = options?.expectedCommitSha?.trim();
    const runImageVerify = Boolean(expectedCommitSha);
    if (!mongoVol && !runRegionSeed && !runImageVerify) return { ok: true };

    const composeDir = `/data/coolify/applications/${target.coolifyAppUuid}`;
    const appUuid = target.coolifyAppUuid;

    try {
      const { host, port, user, privateKey } = await this.sshTarget(
        target.coolifyServerUuid,
        tenantId
      );
      const script = buildPostDeployScript({
        composeDir,
        appUuid,
        mongoVol,
        runRegionSeed,
        environment,
        expectedCommitSha,
        ecrRepository: opts.ecrRepository,
      });
      const result = await runSshCommand({
        host,
        port,
        user,
        privateKey,
        command: script,
        timeoutMs: mongoVol ? 120_000 : 90_000,
      });
      const out = (result.stdout || result.stderr).trim();
      const tail = out.split("\n").slice(-12).join("\n");

      if (out.includes("IMAGE_VERIFY_FAIL")) {
        const msg =
          "Deploy reported success but the app container is still running a stale image " +
          "(does not match the built commit). Force-pull the ECR tag and recreate the app, then redeploy.";
        this.logger.error(`Post-deploy failed for ${tenantId}/${serviceId}/${environment}:\n${tail}`);
        return { ok: false, error: msg };
      }
      if (out.includes("REGION_SEED_FAIL")) {
        const msg =
          "Region seed failed after deploy — check app container logs and MONGO_URI.";
        this.logger.error(`Post-deploy failed for ${tenantId}/${serviceId}/${environment}:\n${tail}`);
        return { ok: false, error: msg };
      }
      if (out.includes("MONGO_EMPTY_FAIL")) {
        const msg =
          "Production Mongo has 0 users after deploy — refusing to mark deploy healthy. " +
          "Data volume may not be pinned; check deploy hooks and docker-compose.yml.";
        this.logger.error(`Post-deploy failed for ${tenantId}/${serviceId}/${environment}:\n${tail}`);
        return { ok: false, error: msg };
      }
      if (out.includes("MONGO_VERIFY_FAIL") || out.includes("MONGO_PING_FAIL")) {
        const msg = "Production Mongo failed health verification after deploy.";
        this.logger.error(`Post-deploy failed for ${tenantId}/${serviceId}/${environment}:\n${tail}`);
        return { ok: false, error: msg };
      }

      this.logger.log(`Post-deploy hooks for ${tenantId}/${serviceId}/${environment}:\n${tail}`);
      return { ok: true };
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.warn(
        `Post-deploy hooks failed for ${tenantId}/${serviceId}/${environment}: ${msg}`
      );
      return { ok: false, error: msg };
    }
  }

  async ensureCoolifyNetwork(tenantId: string, serverUuid: string): Promise<boolean> {
    try {
      const { host, port, user, privateKey } = await this.sshTarget(serverUuid, tenantId);
      const cmd =
        "docker network inspect coolify >/dev/null 2>&1 && echo NET_EXISTS || " +
        "(docker network create --attachable coolify >/dev/null 2>&1 || sudo docker network create --attachable coolify >/dev/null 2>&1) && echo NET_CREATED";
      const result = await runSshCommand({ host, port, user, privateKey, command: cmd, timeoutMs: 30_000 });
      const out = (result.stdout || result.stderr).trim();
      const last = out.split("\n").pop() ?? out;
      this.logger.log(`ensureCoolifyNetwork ${serverUuid}: ${last}`);
      return out.includes("NET_EXISTS") || out.includes("NET_CREATED");
    } catch (err) {
      this.logger.warn(
        `ensureCoolifyNetwork failed for ${serverUuid}: ${(err as Error).message}`
      );
      return false;
    }
  }

  /**
   * Pre-deploy: pin the compose mongo service to the production data volume on disk
   * so Coolify's `docker compose up` does not create a fresh empty mongo_data volume.
   */
  async ensureProdMongoVolumePin(
    tenantId: string,
    serverUuid: string,
    composeDir: string,
    mongoDataVolume: string
  ): Promise<void> {
    if (!mongoDataVolume.trim()) return;
    try {
      const { host, port, user, privateKey } = await this.sshTarget(serverUuid, tenantId);
      const script = buildMongoVolumePinScript(composeDir, mongoDataVolume);
      const result = await runSshCommand({ host, port, user, privateKey, command: script, timeoutMs: 45_000 });
      const last = (result.stdout || result.stderr).trim().split("\n").pop() ?? "";
      this.logger.log(`ensureProdMongoVolumePin ${serverUuid}: ${last}`);
    } catch (err) {
      this.logger.warn(
        `ensureProdMongoVolumePin failed for ${serverUuid}: ${(err as Error).message}`
      );
    }
  }

  async ensureEcrLogin(
    tenantId: string,
    serverUuid: string,
    appUuid: string
  ): Promise<"ok" | "skipped" | "failed"> {
    try {
      const { host, port, user, privateKey } = await this.sshTarget(serverUuid, tenantId);
      const composeDir = `/data/coolify/applications/${appUuid}`;
      const script = [
        `REG=$(grep -oE '[0-9]{12}\\.dkr\\.ecr\\.[a-z0-9-]+\\.amazonaws\\.com' ${composeDir}/docker-compose.yml 2>/dev/null | head -1)`,
        '[ -z "$REG" ] && echo NO_ECR && exit 0',
        "ACCT=$(echo \"$REG\" | grep -oE '^[0-9]{12}')",
        "REGION=$(echo \"$REG\" | sed -E 's/^[0-9]+\\.dkr\\.ecr\\.([a-z0-9-]+)\\.amazonaws\\.com/\\1/')",
        "MYACCT=$(aws sts get-caller-identity --query Account --output text 2>/dev/null)",
        '[ -z "$MYACCT" ] && echo ECR_NO_AWS_CREDS && exit 0',
        '[ "$ACCT" != "$MYACCT" ] && echo ECR_SKIP_XACCT && exit 0',
        'aws ecr get-login-password --region "$REGION" | sudo docker login --username AWS --password-stdin "$REG" >/dev/null 2>&1 && echo ECR_LOGIN_OK || echo ECR_LOGIN_FAIL',
      ].join("\n");
      const result = await runSshCommand({ host, port, user, privateKey, command: script, timeoutMs: 45_000 });
      const out = (result.stdout || result.stderr).trim();
      const last = out.split("\n").pop() ?? out;
      this.logger.log(`ensureEcrLogin ${serverUuid} (${appUuid}): ${last}`);
      if (last.includes("ECR_LOGIN_OK")) return "ok";
      if (last.includes("ECR_LOGIN_FAIL")) return "failed";
      return "skipped";
    } catch (err) {
      this.logger.warn(`ensureEcrLogin failed for ${serverUuid}: ${(err as Error).message}`);
      return "failed";
    }
  }

  private async sshTarget(uuid: string, tenantId: string) {
    const raw = await this.coolify.getServer(uuid);
    if (!this.servers.isVisibleToTenant(raw, tenantId)) {
      throw new NotFoundException("Server not found for this tenant");
    }
    const privateKey = await this.coolify.getServerPrivateKeyMaterial(uuid);
    if (!privateKey) throw new NotFoundException("SSH key not available for server");
    return {
      host: raw.ip ?? "",
      port: (raw as { port?: number }).port ?? 22,
      user: (raw as { user?: string }).user ?? "root",
      privateKey,
    };
  }
}

function buildMongoVolumePinScript(composeDir: string, mongoVol: string): string {
  const volB64 = Buffer.from(mongoVol).toString("base64");
  return [
    "set -e",
    `cd "${composeDir}"`,
    `VOL=$(echo '${volB64}' | base64 -d)`,
    "python3 - <<'PY'",
    "import pathlib, re, os, base64",
    `compose_dir = ${JSON.stringify(composeDir)}`,
    `vol = base64.b64decode(${JSON.stringify(Buffer.from(mongoVol).toString("base64"))}).decode()`,
    "path = pathlib.Path(compose_dir) / 'docker-compose.yml'",
    "text = path.read_text()",
    "if vol in text:",
    "    print('MONGO_VOL_ALREADY_PINNED')",
    "else:",
    "    text = re.sub(",
    "        r'^volumes:\\n  mongo_data:\\s*\\n',",
    "        f'volumes:\\n  mongo_data:\\n    external: true\\n    name: {vol}\\n',",
    "        text,",
    "        count=1,",
    "        flags=re.M,",
    "    )",
    "    if vol not in text:",
    "        raise SystemExit('MONGO_VOL_PIN_FAILED')",
    "    path.write_text(text)",
    "    print('MONGO_VOL_PINNED')",
    "PY",
  ].join("\n");
}

function buildImageVerifySection(input: {
  composeDir: string;
  expectedCommitSha?: string;
  ecrRepository?: string;
}): string {
  const full = input.expectedCommitSha?.trim() ?? "";
  const short = full.slice(0, 7);
  const ecrRepo = input.ecrRepository?.trim() ?? "";
  const lines = [
    "# Verify running app container matches freshly pulled image (catches stale ECR tags).",
    'APP=$(docker ps --format "{{.Names}}" | grep -E "^(app-|work-)" | head -1)',
    'if [ -z "$APP" ]; then echo IMAGE_VERIFY_SKIP=no_app',
    "else",
    '  RUNNING_ID=$(docker inspect "$APP" --format "{{.Image}}")',
    '  RUNNING_VER=$(docker exec "$APP" node -p "require(\\"./package.json\\").version" 2>/dev/null || echo unknown)',
    `  cd "${input.composeDir}"`,
    '  IMAGE=$(grep -E "^[[:space:]]+image:" docker-compose.yml | head -1 | sed -E "s/^[[:space:]]*image:[[:space:]]*//" | tr -d "\\"\'")',
    '  if [ -z "$IMAGE" ]; then echo IMAGE_VERIFY_FAIL=no_compose_image; exit 1; fi',
    '  REG=$(echo "$IMAGE" | grep -oE "[0-9]{12}\\.dkr\\.ecr\\.[a-z0-9-]+\\.amazonaws\\.com" || true)',
    '  if [ -n "$REG" ]; then',
    '    REGION=$(echo "$REG" | sed -E "s/^[0-9]+\\.dkr\\.ecr\\.([a-z0-9-]+)\\.amazonaws\\.com/\\1/")',
    '    aws ecr get-login-password --region "$REGION" | sudo docker login --username AWS --password-stdin "$REG" >/dev/null 2>&1 || true',
    "  fi",
    '  sudo docker pull "$IMAGE" >/dev/null 2>&1 || { echo IMAGE_VERIFY_FAIL=pull_compose_image; exit 1; }',
    '  WANT_ID=$(docker image inspect "$IMAGE" --format "{{.Id}}")',
    '  if [ "$RUNNING_ID" != "$WANT_ID" ]; then',
    '    echo "IMAGE_VERIFY_FAIL=stale_compose_tag running=$RUNNING_ID pulled=$WANT_ID version=$RUNNING_VER"',
    "    exit 1",
    "  fi",
  ];

  if (short && ecrRepo) {
    lines.push(
      `  REF="${ecrRepo}:${short}"`,
      '  sudo docker pull "$REF" >/dev/null 2>&1 || { echo IMAGE_VERIFY_FAIL=pull_commit_tag; exit 1; }',
      '  REF_ID=$(docker image inspect "$REF" --format "{{.Id}}")',
      '  if [ "$RUNNING_ID" != "$REF_ID" ]; then',
      `    echo "IMAGE_VERIFY_FAIL=commit_tag_mismatch running=$RUNNING_ID expected_ref=$REF version=$RUNNING_VER"`,
      "    exit 1",
      "  fi"
    );
  }

  if (full) {
    lines.push(
      `  EXPECTED="${full}"`,
      `  EXPECTED_SHORT="${short}"`,
      '  BUILT=$(docker exec "$APP" printenv BUILD_COMMIT 2>/dev/null || true)',
      '  if [ -n "$BUILT" ]; then',
      '    case "$BUILT" in *"$EXPECTED_SHORT"*|"$EXPECTED"|*"$EXPECTED"*) echo "IMAGE_VERIFY_OK commit=$BUILT version=$RUNNING_VER" ;;',
      '    *) echo "IMAGE_VERIFY_FAIL=build_commit_mismatch built=$BUILT expected=$EXPECTED_SHORT version=$RUNNING_VER"; exit 1 ;;',
      "    esac",
      "  else",
      '    echo "IMAGE_VERIFY_OK digest_match version=$RUNNING_VER"',
      "  fi"
    );
  } else {
    lines.push('  echo "IMAGE_VERIFY_OK digest_match version=$RUNNING_VER"');
  }

  lines.push("fi");
  return lines.join("\n");
}

function buildRegionSeedSection(): string {
  return [
    'APP=$(docker ps --format "{{.Names}}" | grep -E "^(app-|work-)" | head -1)',
    'if [ -z "$APP" ]; then echo REGION_SEED_SKIP=no_app; else',
    '  if docker exec "$APP" test -f scripts/seed-regions.js; then',
    '    echo "region_seed_app=$APP"',
    '    docker exec "$APP" node scripts/seed-regions.js || { echo REGION_SEED_FAIL; exit 1; }',
    '    echo REGION_SEED_OK',
    "  else",
    '    echo REGION_SEED_SKIP=no_script',
    "  fi",
    "fi",
  ].join("\n");
}

function buildPostDeployScript(input: {
  composeDir: string;
  appUuid: string;
  mongoVol?: string;
  runRegionSeed: boolean;
  environment: "staging" | "production";
  expectedCommitSha?: string;
  ecrRepository?: string;
}): string {
  const imageVerify =
    input.expectedCommitSha != null
      ? buildImageVerifySection({
          composeDir: input.composeDir,
          expectedCommitSha: input.expectedCommitSha,
          ecrRepository: input.ecrRepository,
        })
      : "echo IMAGE_VERIFY_SKIP=no_expected_commit";

  if (!input.mongoVol) {
    return ["set -e", imageVerify, input.runRegionSeed ? buildRegionSeedSection() : "echo REGION_SEED_SKIP=disabled"].join("\n");
  }
  const mongoFix = `services:
  mongo:
    container_name: mongo-latest
    image: mongo:7
    restart: always
    ports:
      - "27018:27017"
    volumes:
      - mongo_data:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "--quiet", "--eval", "db.adminCommand('ping').ok"]
      interval: 3s
      timeout: 10s
      retries: 20
      start_period: 15s
volumes:
  mongo_data:
    external: true
    name: ${input.mongoVol}
`;

  const mongoFixB64 = Buffer.from(mongoFix).toString("base64");

  return [
    "set -e",
    imageVerify,
    `cd "${input.composeDir}"`,
    "docker network inspect coolify >/dev/null 2>&1 || sudo docker network create coolify",
    `echo '${mongoFixB64}' | base64 -d > docker-compose.mongo-fix.yml`,
    "# Remove Coolify-managed duplicate mongo containers (empty volumes from unpinned deploys).",
    `sudo docker stop $(docker ps -q -f name=mongo-${input.appUuid}) 2>/dev/null || true`,
    `sudo docker rm $(docker ps -aq -f name=mongo-${input.appUuid}) 2>/dev/null || true`,
    'MONGO=$(docker ps --format "{{.Names}}" | grep -E "^(mongo-latest|mongo-${input.appUuid})" | head -1)',
    'RUNNING=$(docker inspect mongo-latest --format "{{.State.Running}}" 2>/dev/null || echo false)',
    "MONGO_RECOVERED=0",
    `if [ -z "$MONGO" ] || [ "$RUNNING" != "true" ]; then`,
    "  sudo docker stop mongo-latest 2>/dev/null || true",
    "  sudo docker rm mongo-latest 2>/dev/null || true",
    "  sudo docker compose -f docker-compose.yml -f docker-compose.mongo-fix.yml up -d mongo",
    "  MONGO_RECOVERED=1",
    "  sleep 8",
    "fi",
    'RUNNING=$(docker inspect mongo-latest --format "{{.State.Running}}" 2>/dev/null || echo false)',
    'if [ "$RUNNING" != "true" ]; then echo MONGO_VERIFY_FAIL; exit 1; fi',
    'docker exec mongo-latest mongosh --quiet --eval "db.adminCommand({ ping: 1 }).ok" 2>/dev/null | grep -q 1 || { echo MONGO_PING_FAIL; exit 1; }',
    'USERS=$(docker exec mongo-latest mongosh --quiet bubblbook --eval "db.users.countDocuments()" 2>/dev/null || echo 0)',
    'echo "mongo_users=$USERS mongo_recovered=$MONGO_RECOVERED"',
    'if [ "${USERS:-0}" -lt 1 ]; then echo MONGO_EMPTY_FAIL; exit 1; fi',
    'APP=$(docker ps --format "{{.Names}}" | grep -E "^(app-|work-)" | head -1)',
    'APP_NET=$(docker network ls --format "{{.Name}}" | grep nf6adysipbutbwzslufhhoqg | head -1)',
    'if [ -n "$APP_NET" ]; then docker network disconnect "$APP_NET" mongo-latest 2>/dev/null || true; docker network connect --alias mongo "$APP_NET" mongo-latest 2>/dev/null || true; echo mongo_network=$APP_NET; fi',
    'if [ "$MONGO_RECOVERED" = "1" ] && [ -n "$APP" ]; then sudo docker restart "$APP" 2>/dev/null || true; echo app_restarted=$APP; fi',
    'if [ -n "$APP" ] && ! docker exec "$APP" getent hosts mongo >/dev/null 2>&1; then sudo docker restart "$APP" 2>/dev/null || true; echo app_restarted_for_mongo_dns=$APP; fi',
    'test -n "$APP_NET" && test -n "$APP" && docker network inspect "$APP_NET" --format "{{range .Containers}}{{.Name}} {{end}}" | grep -q mcp-server || docker network connect "$APP_NET" mcp-server 2>/dev/null || true',
    'docker exec mongo-latest mongosh --quiet bubblbook --eval "printjson({users:db.users.countDocuments()})" 2>/dev/null || true',
    "curl -sf -o /dev/null -w 'post_deploy_http=%{http_code}\\n' --max-time 8 http://127.0.0.1:3300/ || true",
    input.runRegionSeed ? buildRegionSeedSection() : "echo REGION_SEED_SKIP=disabled",
  ].join("\n");
}
