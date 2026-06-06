import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";

import { ConfigService } from "@nestjs/config";

import { randomUUID } from "node:crypto";

import { DeployRequestDto, DeployResult } from "./dto/deploy.dto";

import { DeployRunsService } from "./deploy-runs.service";

import { ServicesService } from "./services.service";

import type { DeployRunStatus } from "./deploy-runs.types";

import type { TenantContext } from "../common/tenant/tenant-context";



/**

 * CI/CD module — the "One-Button Deploy" backend.

 *

 * Flow: validate RBAC → compute release tag → call Coolify deploy API (or simulate)

 * → persist deploy run → stream status to UI via DeployRunsService.

 */

@Injectable()

export class CicdService {

  private readonly logger = new Logger(CicdService.name);



  constructor(

    private readonly config: ConfigService,

    private readonly deployRuns: DeployRunsService,

    private readonly services: ServicesService

  ) {}



  /** User-initiated deploy from the dashboard. RBAC-gated. */

  async deploy(dto: DeployRequestDto, tenant: TenantContext): Promise<DeployResult> {

    this.assertCanDeploy(dto, tenant);

    return this.triggerDeploy(dto, tenant.tenantId, tenant.accountId);

  }



  /**

   * Deploy authorized by a WhatsApp HITL approval (not the dashboard caller's

   * role). The approval *is* the authorization, so the user-RBAC gate is skipped.

   */

  async executeApprovedDeploy(

    payload: DeployRequestDto,

    tenantId: string,

    approverWaId: string

  ): Promise<DeployResult> {

    this.logger.log(

      `Approved deploy via WhatsApp (${approverWaId}) → ${payload.project}/${payload.environment}`

    );

    return this.triggerDeploy(payload, tenantId, `whatsapp:${approverWaId}`);

  }



  /** Core trigger shared by both the RBAC and HITL-approved paths. */

  private async triggerDeploy(

    dto: DeployRequestDto,

    tenantId: string,

    actor: string

  ): Promise<DeployResult> {

    const driver = this.resolveDriver();

    const tag = this.buildReleaseTag(dto.environment);

    const serviceId = dto.serviceId ?? this.parseServiceId(tenantId, dto.project);



    if (driver === "simulate") {

      const deploymentId = `sim-${randomUUID()}`;

      await this.deployRuns.create({

        id: deploymentId,

        tenantId,

        project: dto.project,

        serviceId: serviceId ?? undefined,

        environment: dto.environment,

        tag,

        actor,

        driver: "simulate",

      });

      this.logger.log(

        `[simulate] queued ${deploymentId} [tenant=${tenantId}] by ${actor} → ${dto.project}/${dto.environment} (tag=${tag})`

      );

      this.scheduleSimulatedLifecycle(deploymentId, tenantId, serviceId, dto.environment, tag);

      return {

        deploymentId,

        project: dto.project,

        environment: dto.environment,

        status: "queued",

        tag,

      };

    }



    const coolifyBase = this.requireConfig("COOLIFY_API_URL");

    const coolifyToken = this.requireConfig("COOLIFY_API_TOKEN");

    const appUuid = await this.resolveCoolifyAppUuid(dto, tenantId);

    const idempotencyKey = randomUUID();



    this.logger.log(

      `Deploy [tenant=${tenantId}] by ${actor} → ${dto.project}/${dto.environment} (tag=${tag})`

    );



    try {

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



      await this.deployRuns.create({

        id: deploymentId,

        tenantId,

        project: dto.project,

        serviceId: serviceId ?? undefined,

        environment: dto.environment,

        tag,

        actor,

        driver: "coolify",

      });



      this.logger.log(`Deploy queued: ${deploymentId}`);

      this.pollCoolifyDeployment(deploymentId, coolifyBase, coolifyToken, tenantId, serviceId, dto.environment, tag);



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



  /** Handle Coolify notification webhooks (deployment_started / success / failed). */

  async handleCoolifyNotification(payload: Record<string, unknown>): Promise<void> {

    const deploymentId =

      (payload.deployment_uuid as string) ?? (payload.deploymentUuid as string) ?? null;

    if (!deploymentId) {

      this.logger.warn("Coolify webhook missing deployment_uuid");

      return;

    }



    const event = String(payload.event ?? "");

    const status = this.mapCoolifyEvent(event, payload.success);

    if (!status) return;



    const run = await this.deployRuns.getById(deploymentId);

    if (!run) {

      this.logger.warn(`Coolify webhook for unknown deployment ${deploymentId}`);

      return;

    }



    const commitSha = (payload.commit as string) ?? undefined;

    await this.deployRuns.updateStatus(deploymentId, status, {

      commitSha,

      errorMessage: status === "failed" ? String(payload.message ?? event) : undefined,

    });



    if (status === "success" || status === "failed") {

      await this.finalizeServiceEnv(run.tenantId, run.serviceId, run.environment, status, run.tag, commitSha);

    }

  }



  private scheduleSimulatedLifecycle(

    deploymentId: string,

    tenantId: string,

    serviceId: string | null,

    environment: "staging" | "production",

    tag: string

  ): void {

    setTimeout(() => void this.deployRuns.updateStatus(deploymentId, "building"), 800);

    setTimeout(async () => {

      const fakeCommit = randomUUID().replace(/-/g, "").slice(0, 7);

      await this.deployRuns.updateStatus(deploymentId, "success", { commitSha: fakeCommit });

      await this.finalizeServiceEnv(tenantId, serviceId, environment, "success", tag, fakeCommit);

    }, 2000);

  }



  /** Poll Coolify until the deployment reaches a terminal state. */

  private pollCoolifyDeployment(

    deploymentId: string,

    coolifyBase: string,

    coolifyToken: string,

    tenantId: string,

    serviceId: string | null,

    environment: "staging" | "production",

    tag: string

  ): void {

    const started = Date.now();

    const maxMs = 20 * 60_000;

    const intervalMs = 4_000;



    const tick = async (): Promise<void> => {

      if (Date.now() - started > maxMs) {

        await this.deployRuns.updateStatus(deploymentId, "failed", {

          errorMessage: "Timed out waiting for Coolify deployment",

        });

        await this.finalizeServiceEnv(tenantId, serviceId, environment, "failed", tag);

        return;

      }



      try {

        const res = await fetch(`${coolifyBase}/api/v1/deployments/${deploymentId}`, {

          headers: { Authorization: `Bearer ${coolifyToken}` },

          signal: AbortSignal.timeout(10_000),

        });

        if (!res.ok) {

          setTimeout(() => void tick(), intervalMs);

          return;

        }



        const body = (await res.json()) as { status?: string; commit?: string };

        const mapped = this.mapCoolifyApiStatus(body.status);

        const current = await this.deployRuns.getById(deploymentId);

        if (!current || current.status === mapped) {

          if (mapped === "success" || mapped === "failed") return;

          setTimeout(() => void tick(), intervalMs);

          return;

        }



        await this.deployRuns.updateStatus(deploymentId, mapped, {

          commitSha: body.commit,

          errorMessage: mapped === "failed" ? body.status : undefined,

        });



        if (mapped === "success" || mapped === "failed") {

          await this.finalizeServiceEnv(

            tenantId,

            serviceId,

            environment,

            mapped,

            tag,

            body.commit

          );

          return;

        }

      } catch (err) {

        this.logger.warn(`Coolify poll error for ${deploymentId}: ${(err as Error).message}`);

      }

      setTimeout(() => void tick(), intervalMs);

    };



    setTimeout(() => void tick(), intervalMs);

  }



  private async finalizeServiceEnv(

    tenantId: string,

    serviceId: string | null,

    environment: "staging" | "production",

    outcome: "success" | "failed",

    tag: string,

    commitSha?: string

  ): Promise<void> {

    if (!serviceId) return;

    await this.services.applyDeployOutcome(tenantId, serviceId, environment, {

      status: outcome === "success" ? "active" : "error",

      tag,

      commitSha,

    });

  }



  private mapCoolifyEvent(event: string, success?: unknown): DeployRunStatus | null {

    if (event === "deployment_started" || event === "deployment_queued") return "building";

    if (event === "deployment_success" || (event.includes("success") && success !== false)) {

      return "success";

    }

    if (event === "deployment_failed" || event.includes("fail")) return "failed";

    return null;

  }



  private mapCoolifyApiStatus(raw?: string): DeployRunStatus {

    const s = (raw ?? "").toLowerCase();

    if (s.includes("fail") || s.includes("cancel") || s.includes("error")) return "failed";

    if (s.includes("finish") || s.includes("success") || s === "completed") return "success";

    if (s.includes("progress") || s.includes("build") || s.includes("running")) return "building";

    return "queued";

  }



  private parseServiceId(tenantId: string, project: string): string | null {

    const prefix = `${tenantId}-`;

    return project.startsWith(prefix) ? project.slice(prefix.length) : null;

  }



  private resolveDriver(): "coolify" | "simulate" {

    const explicit = this.config.get<string>("DEPLOY_DRIVER");

    if (explicit === "coolify" || explicit === "simulate") return explicit;

    return this.config.get<string>("COOLIFY_API_URL") ? "coolify" : "simulate";

  }



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



  private async resolveCoolifyAppUuid(dto: DeployRequestDto, tenantId: string): Promise<string> {

    if (dto.serviceId) {

      const service = await this.services.get(tenantId, dto.serviceId);

      const env = service?.environments.find((e) => e.environment === dto.environment);

      if (env?.coolifyAppUuid) return env.coolifyAppUuid;

    }



    const key = `COOLIFY_APP_${dto.project.replace(/-/g, "_").toUpperCase()}_${dto.environment.toUpperCase()}`;

    return this.requireConfig(key);

  }



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


