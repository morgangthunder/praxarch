import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";

import { ConfigService } from "@nestjs/config";

import { randomUUID } from "node:crypto";

import { DeployRequestDto, DeployResult } from "./dto/deploy.dto";

import { DeployRunsService } from "./deploy-runs.service";

import { CoolifyEnvService } from "./coolify-env.service";

import { DeployTargetsService } from "./deploy-targets.service";

import { ServicesService } from "./services.service";

import { DeploymentComposeService, type SourceDeployHandle } from "./deployment-compose.service";
import { ProdPostDeployService } from "./prod-post-deploy.service";
import { EcrReleaseService } from "./ecr-release.service";

import { isSourceBuildProfile, normalizeDeployProfile } from "./compose-build-profiles";

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

  /** Praxarch deploy-run id → Coolify deployment uuid (ECR pipeline). */
  private readonly coolifyDeployIds = new Map<string, string>();



  constructor(

    private readonly config: ConfigService,

    private readonly deployRuns: DeployRunsService,

    private readonly deployTargets: DeployTargetsService,

    private readonly services: ServicesService,

    private readonly coolifyEnv: CoolifyEnvService,

    private readonly deploymentCompose: DeploymentComposeService,

    private readonly prodPostDeploy: ProdPostDeployService,

    private readonly ecrRelease: EcrReleaseService

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

    const target =
      serviceId != null ? await this.deployTargets.get(tenantId, serviceId, dto.environment) : null;

    const deployProfile = normalizeDeployProfile(target?.deployProfile);

    if (serviceId) {
      try {
        await this.coolifyEnv.syncServiceEnvironment(tenantId, serviceId, dto.environment);
      } catch (err) {
        this.logger.warn(
          `Env sync skipped for ${serviceId}/${dto.environment}: ${(err as Error).message}`
        );
      }
    }

    if (target && isSourceBuildProfile(deployProfile)) {
      const branch = dto.ref?.trim() || target.branch;
      const deploymentId = `ssh-${randomUUID()}`;

      await this.deployRuns.create({
        id: deploymentId,
        tenantId,
        project: dto.project,
        serviceId: serviceId ?? undefined,
        environment: dto.environment,
        tag,
        actor,
        driver: "ssh-build",
      });

      this.logger.log(
        `Source deploy [tenant=${tenantId}] by ${actor} → ${dto.project}/${dto.environment} profile=${deployProfile} branch=${branch}`
      );

      try {
        const handle = await this.deploymentCompose.startSourceDeploy(
          tenantId,
          serviceId!,
          dto.environment,
          { branch, deploymentId }
        );
        await this.deployRuns.updateStatus(deploymentId, "building");
        this.pollSourceDeploy(
          deploymentId,
          handle,
          tenantId,
          serviceId,
          dto.environment,
          tag
        );
      } catch (err) {
        await this.deployRuns.updateStatus(deploymentId, "failed", {
          errorMessage: (err as Error).message,
        });
        throw new HttpException(
          { message: "Source deploy failed to start", detail: (err as Error).message },
          HttpStatus.BAD_GATEWAY
        );
      }

      return {
        deploymentId,
        project: dto.project,
        environment: dto.environment,
        status: "queued",
        tag,
      };
    }

    if (
      target &&
      serviceId &&
      this.ecrRelease.needsEcrRelease(target, dto.environment)
    ) {
      const deploymentId = `ecr-${randomUUID()}`;

      await this.deployRuns.create({
        id: deploymentId,
        tenantId,
        project: dto.project,
        serviceId,
        environment: dto.environment,
        tag,
        actor,
        driver: "ecr-release",
      });

      this.logger.log(
        `ECR production pipeline [tenant=${tenantId}] by ${actor} → ${dto.project}/${dto.environment}`
      );

      void this.runEcrThenCoolify(
        deploymentId,
        dto,
        tenantId,
        serviceId,
        target,
        tag,
        actor,
        appUuid,
        coolifyBase,
        coolifyToken
      );

      return {
        deploymentId,
        project: dto.project,
        environment: dto.environment,
        status: "queued",
        tag,
      };
    }

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



      const body = (await res.json().catch(() => ({}))) as {
        deployment_uuid?: string;
        deployments?: Array<{ deployment_uuid?: string; message?: string }>;
      };

      const deploymentId = this.parseCoolifyDeployId(body, idempotencyKey);



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



  /** ECR build → GitHub pin → Coolify deploy → post-deploy hooks. */
  private runEcrThenCoolify(
    deploymentId: string,
    dto: DeployRequestDto,
    tenantId: string,
    serviceId: string,
    target: NonNullable<Awaited<ReturnType<DeployTargetsService["get"]>>>,
    tag: string,
    actor: string,
    appUuid: string,
    coolifyBase: string,
    coolifyToken: string
  ): void {
    const run = async (): Promise<void> => {
      try {
        await this.deployRuns.updateStatus(deploymentId, "building");
        const release = await this.ecrRelease.prepareProductionRelease(
          tenantId,
          serviceId,
          target
        );
        await this.deployRuns.updateStatus(deploymentId, "building", {
          commitSha: release.commitSha,
        });

        const idempotencyKey = randomUUID();
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
          throw new Error(`Coolify rejected deploy (${res.status}): ${detail.slice(0, 200)}`);
        }

        const body = (await res.json().catch(() => ({}))) as {
          deployment_uuid?: string;
          deployments?: Array<{ deployment_uuid?: string }>;
        };
        const coolifyId = this.parseCoolifyDeployId(body, idempotencyKey);
        this.coolifyDeployIds.set(deploymentId, coolifyId);
        this.logger.log(`ECR pipeline queued Coolify deploy ${coolifyId} (run ${deploymentId})`);

        this.pollCoolifyDeployment(
          deploymentId,
          coolifyBase,
          coolifyToken,
          tenantId,
          serviceId,
          dto.environment,
          tag
        );
      } catch (err) {
        await this.deployRuns.updateStatus(deploymentId, "failed", {
          errorMessage: (err as Error).message?.slice(0, 240) ?? "ECR release failed",
        });
        await this.finalizeServiceEnv(tenantId, serviceId, dto.environment, "failed", tag);
      }
    };

    void run();
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

    let pollMisses = 0;



    const tick = async (): Promise<void> => {

      if (Date.now() - started > maxMs) {

        await this.deployRuns.updateStatus(deploymentId, "failed", {

          errorMessage: "Timed out waiting for Coolify deployment",

        });

        await this.finalizeServiceEnv(tenantId, serviceId, environment, "failed", tag);

        return;

      }

      const coolifyDeploymentId = this.coolifyDeployIds.get(deploymentId) ?? deploymentId;

      try {

        const res = await fetch(`${coolifyBase}/api/v1/deployments/${coolifyDeploymentId}`, {

          headers: { Authorization: `Bearer ${coolifyToken}` },

          signal: AbortSignal.timeout(10_000),

        });

        if (!res.ok) {

          pollMisses += 1;

          if (pollMisses >= 8) {

            await this.deployRuns.updateStatus(deploymentId, "failed", {

              errorMessage: `Coolify deployment ${coolifyDeploymentId} not found — check Coolify dashboard`,

            });

            return;

          }

          setTimeout(() => void tick(), intervalMs);

          return;

        }

        pollMisses = 0;



        const body = (await res.json()) as { status?: string; commit?: string; logs?: string };

        const mapped = this.mapCoolifyApiStatus(body.status);

        const errorHint = mapped === "failed" ? this.summarizeCoolifyFailure(body) : undefined;

        const current = await this.deployRuns.getById(deploymentId);

        if (!current) {

          setTimeout(() => void tick(), intervalMs);

          return;

        }

        const statusUnchanged = current.status === mapped;

        const errorUnchanged = !errorHint || current.errorMessage === errorHint;

        if (statusUnchanged && errorUnchanged) {

          if (mapped === "success" || mapped === "failed") return;

          setTimeout(() => void tick(), intervalMs);

          return;

        }



        await this.deployRuns.updateStatus(deploymentId, mapped, {

          commitSha: body.commit,

          errorMessage: errorHint ?? (mapped === "failed" ? body.status : undefined),

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



  /** Poll SSH source-build until done file appears on the Coolify host. */

  private pollSourceDeploy(

    deploymentId: string,

    handle: SourceDeployHandle,

    tenantId: string,

    serviceId: string | null,

    environment: "staging" | "production",

    tag: string

  ): void {

    const started = Date.now();

    const maxMs = 40 * 60_000;

    const intervalMs = 5_000;



    const tick = async (): Promise<void> => {

      if (Date.now() - started > maxMs) {

        await this.deployRuns.updateStatus(deploymentId, "failed", {

          errorMessage: "Timed out waiting for source build on server",

        });

        await this.finalizeServiceEnv(tenantId, serviceId, environment, "failed", tag);

        return;

      }



      try {

        const poll = await this.deploymentCompose.pollSourceDeploy(
          { ...handle, composeDir: handle.composeDir },
          tenantId
        );

        if (poll.status === "building") {

          setTimeout(() => void tick(), intervalMs);

          return;

        }

        await this.deployRuns.updateStatus(deploymentId, poll.status, {

          commitSha: poll.commitSha,

          errorMessage: poll.errorMessage,

        });

        await this.finalizeServiceEnv(

          tenantId,

          serviceId,

          environment,

          poll.status,

          tag,

          poll.commitSha

        );

      } catch (err) {

        this.logger.warn(`SSH deploy poll error for ${deploymentId}: ${(err as Error).message}`);

        setTimeout(() => void tick(), intervalMs);

      }

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

    if (outcome === "success") {
      await this.prodPostDeploy.afterCoolifySuccess(tenantId, serviceId, environment);
    }

  }



  private mapCoolifyEvent(event: string, success?: unknown): DeployRunStatus | null {

    if (event === "deployment_started" || event === "deployment_queued") return "building";

    if (event === "deployment_success" || (event.includes("success") && success !== false)) {

      return "success";

    }

    if (event === "deployment_failed" || event.includes("fail")) return "failed";

    return null;

  }



  private parseCoolifyDeployId(
    body: { deployment_uuid?: string; deployments?: Array<{ deployment_uuid?: string }> },
    fallback: string
  ): string {
    if (body.deployment_uuid) return body.deployment_uuid;
    const fromList = body.deployments?.[0]?.deployment_uuid;
    if (fromList) return fromList;
    return fallback;
  }

  /** Pull a short error line from Coolify deployment logs JSON. */
  private summarizeCoolifyFailure(body: { logs?: string; status?: string }): string | undefined {
    if (body.logs) {
      try {
        const entries = JSON.parse(body.logs) as Array<{ output?: string; type?: string; hidden?: boolean }>;
        const visible = entries.filter((e) => e.type === "stderr" && e.output && !e.hidden);
        const root = visible.find((e) => e.output?.includes("Deployment failed:"));
        if (root?.output) {
          const line = root.output.replace(/^Deployment failed:\s*/i, "").split("\n")[0];
          return line.slice(0, 240);
        }
        const err = [...visible]
          .reverse()
          .find((e) => e.output && !e.output.startsWith("====") && !e.output.includes("No such container"));
        if (err?.output) return err.output.slice(0, 240);
      } catch {
        /* ignore */
      }
    }
    return body.status;
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
    if (project.startsWith(prefix)) return project.slice(prefix.length);
    // Service slug may equal tenant slug (e.g. bubblbook/bubblbook) without a prefix.
    if (project === tenantId) return project;
    return null;
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

    const serviceId = dto.serviceId ?? this.parseServiceId(tenantId, dto.project);

    if (serviceId) {

      const target = await this.deployTargets.get(tenantId, serviceId, dto.environment);

      if (target?.coolifyAppUuid) {

        if (target.status === "error") {

          throw new HttpException(

            target.errorMessage ?? "Deploy target provisioning failed",

            HttpStatus.BAD_GATEWAY

          );

        }

        if (target.status !== "ready") {

          throw new HttpException(

            `Deploy target is ${target.status}; wait for provisioning to finish`,

            HttpStatus.CONFLICT

          );

        }

        return target.coolifyAppUuid;

      }



      const service = await this.services.get(tenantId, serviceId);

      const env = service?.environments.find((e) => e.environment === dto.environment);

      if (env?.coolifyAppUuid) return env.coolifyAppUuid;

    }



    const key = `COOLIFY_APP_${dto.project.replace(/-/g, "_").toUpperCase()}_${dto.environment.toUpperCase()}`;

    const fromEnv = this.config.get<string>(key);

    if (fromEnv) return fromEnv;



    throw new HttpException(

      `Deploy not configured for ${dto.project}/${dto.environment}. Add a deploy_targets row or ${key}.`,

      HttpStatus.BAD_GATEWAY

    );

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


