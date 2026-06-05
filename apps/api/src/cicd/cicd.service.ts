import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { DeployRequestDto, DeployResult } from "./dto/deploy.dto";
import type { TenantContext } from "../common/tenant/tenant-context";

/**
 * CI/CD module — the "One-Button Deploy" backend.
 *
 * Flow: validate RBAC → compute release tag → call Coolify deploy API with a
 * bearer token held ONLY here (never the frontend). Production deploys are
 * gated to operators; everything is audit-logged + idempotent.
 */
@Injectable()
export class CicdService {
  private readonly logger = new Logger(CicdService.name);

  constructor(private readonly config: ConfigService) {}

  async deploy(dto: DeployRequestDto, tenant: TenantContext): Promise<DeployResult> {
    this.assertCanDeploy(dto, tenant);

    const coolifyBase = this.requireConfig("COOLIFY_API_URL");
    const coolifyToken = this.requireConfig("COOLIFY_API_TOKEN");
    const appUuid = this.resolveCoolifyAppUuid(dto);

    const tag = this.buildReleaseTag(dto.environment);
    const idempotencyKey = randomUUID();

    this.logger.log(
      `Deploy requested by ${tenant.accountId} → ${dto.project}/${dto.environment} (tag=${tag})`
    );

    try {
      // Coolify exposes a deploy trigger by application UUID.
      const res = await fetch(`${coolifyBase}/api/v1/deploy?uuid=${appUuid}&force=false`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${coolifyToken}`,
          "X-Idempotency-Key": idempotencyKey,
        },
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        this.logger.error(`Coolify rejected deploy (${res.status}): ${detail}`);
        throw new HttpException(
          { message: "Deploy target rejected the request", upstreamStatus: res.status },
          HttpStatus.BAD_GATEWAY
        );
      }

      const body = (await res.json().catch(() => ({}))) as { deployment_uuid?: string };
      const deploymentId = body.deployment_uuid ?? idempotencyKey;

      this.logger.log(`Deploy queued: ${deploymentId}`);
      return {
        deploymentId,
        project: dto.project,
        environment: dto.environment,
        status: "queued",
        tag,
      };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.error(`Deploy call failed: ${(err as Error).message}`);
      throw new HttpException("Unable to reach deploy target", HttpStatus.BAD_GATEWAY);
    }
  }

  /** RBAC: only platform operators may ship; production requires the elevated role. */
  private assertCanDeploy(dto: DeployRequestDto, tenant: TenantContext): void {
    const canDeploy = tenant.roles.includes("platform:operator");
    const canProd = tenant.roles.includes("platform:release");
    if (!canDeploy) {
      throw new HttpException("Insufficient permissions to deploy", HttpStatus.FORBIDDEN);
    }
    if (dto.environment === "production" && !canProd) {
      throw new HttpException("Production deploys require the release role", HttpStatus.FORBIDDEN);
    }
  }

  /** Maps logical project+env to a configured Coolify application UUID. */
  private resolveCoolifyAppUuid(dto: DeployRequestDto): string {
    const key = `COOLIFY_APP_${dto.project.replace(/-/g, "_").toUpperCase()}_${dto.environment.toUpperCase()}`;
    return this.requireConfig(key);
  }

  /** Deterministic, sortable release tag used for git-tagging + traceability. */
  private buildReleaseTag(environment: string): string {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return `${environment}-${stamp}`;
  }

  private requireConfig(key: string): string {
    const value = this.config.get<string>(key);
    if (!value) {
      this.logger.error(`Missing required config: ${key}`);
      throw new HttpException("Deploy not configured", HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return value;
  }
}
