import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { CoolifyApiClient } from "./coolify-api.client";
import { CoolifyServersService } from "./coolify-servers.service";
import { DeployTargetsService } from "./deploy-targets.service";
import { resolveProfileOptions } from "./compose-build-profiles";
import { runSshCommand } from "./remote-ssh.util";

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
   * Currently: pin Mongo to a known data volume + reconnect MCP bridge networks.
   */
  async afterCoolifySuccess(
    tenantId: string,
    serviceId: string,
    environment: "staging" | "production"
  ): Promise<void> {
    const target = await this.deployTargets.get(tenantId, serviceId, environment);
    if (!target) return;

    const opts = resolveProfileOptions(target.deployProfileOptions);
    const mongoVol = opts.mongoDataVolume?.trim();
    if (!mongoVol || !target.coolifyAppUuid || !target.coolifyServerUuid) return;

    const composeDir = `/data/coolify/applications/${target.coolifyAppUuid}`;
    const appUuid = target.coolifyAppUuid;

    try {
      const { host, port, user, privateKey } = await this.sshTarget(
        target.coolifyServerUuid,
        tenantId
      );
      const script = buildPostDeployScript({ composeDir, appUuid, mongoVol });
      const result = await runSshCommand({
        host,
        port,
        user,
        privateKey,
        command: script,
        timeoutMs: 120_000,
      });
      const tail = (result.stdout || result.stderr).trim().split("\n").slice(-8).join("\n");
      this.logger.log(
        `Post-deploy hooks for ${tenantId}/${serviceId}/${environment}:\n${tail}`
      );
    } catch (err) {
      this.logger.warn(
        `Post-deploy hooks failed for ${tenantId}/${serviceId}/${environment}: ${(err as Error).message}`
      );
    }
  }

  /**
   * Pre-deploy guard: ensure the external `coolify` Docker network exists on the
   * target server. Coolify attaches app containers to it; if it was pruned
   * (disk cleanup / daemon restart) the deploy fails with "network coolify not
   * found". Best-effort — a failure here is logged but does not block the deploy
   * (the deploy will surface the real error if the network truly can't be made).
   */
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
   * Pre-deploy guard: if the target's compose pulls an image from ECR, make sure
   * the server is logged in to that registry before Coolify runs `docker compose
   * up` (otherwise the pull fails with "no basic auth credentials").
   *
   * Safe for cross-account setups: it only performs `docker login` when the
   * server's OWN AWS account (via `sts get-caller-identity`) matches the ECR
   * registry account. A prod box pulling a different account's image (granted via
   * repo policy) is left untouched. Best-effort — never blocks the deploy.
   */
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
        // Coolify runs `sudo docker compose up`, so the pull happens as root —
        // log in with sudo so the token lands in root's docker config, not the
        // SSH user's (whose credential store may be "not implemented").
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

function buildPostDeployScript(input: {
  composeDir: string;
  appUuid: string;
  mongoVol: string;
}): string {
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
    `cd "${input.composeDir}"`,
    "docker network inspect coolify >/dev/null 2>&1 || sudo docker network create coolify",
    `echo '${mongoFixB64}' | base64 -d > docker-compose.mongo-fix.yml`,
    `sudo docker stop $(docker ps -q -f name=mongo-${input.appUuid}) 2>/dev/null || true`,
    `sudo docker rm $(docker ps -aq -f name=mongo-${input.appUuid}) 2>/dev/null || true`,
    'MOUNT=$(docker inspect mongo-latest --format "{{range .Mounts}}{{.Name}}{{end}}" 2>/dev/null || echo "")',
    `if echo "$MOUNT" | grep -q "${input.mongoVol}"; then echo mongo_ok; else`,
    "  sudo docker stop mongo-latest 2>/dev/null || true",
    "  sudo docker rm mongo-latest 2>/dev/null || true",
    "  sudo docker compose -f docker-compose.yml -f docker-compose.mongo-fix.yml up -d mongo",
    "fi",
    "sleep 5",
    'APP=$(docker ps --format "{{.Names}}" | grep -E "^(app-|work-)" | head -1)',
    'MCP_NET=$(docker inspect mcp-server --format "{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}" 2>/dev/null | awk "{print \\$1}")',
    'APP_NET=$(docker inspect "$APP" --format "{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}" 2>/dev/null | awk "{print \\$1}")',
    'test -n "$APP" && test -n "$MCP_NET" && docker network inspect "$MCP_NET" --format "{{range .Containers}}{{.Name}} {{end}}" | grep -q "$APP" || docker network connect "$MCP_NET" "$APP" 2>/dev/null || true',
    'test -n "$APP_NET" && docker network inspect "$APP_NET" --format "{{range .Containers}}{{.Name}} {{end}}" | grep -q mcp-server || docker network connect "$APP_NET" mcp-server 2>/dev/null || true',
    'docker exec mongo-latest mongosh --quiet bubblbook --eval "printjson({users:db.users.countDocuments()})" 2>/dev/null || true',
    "curl -sf -o /dev/null -w 'post_deploy_http=%{http_code}\\n' --max-time 8 http://127.0.0.1:3300/ || true",
  ].join("\n");
}
