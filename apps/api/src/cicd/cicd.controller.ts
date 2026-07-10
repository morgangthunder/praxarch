import {

  Body,

  Controller,

  Get,

  BadRequestException,

  Headers,

  HttpCode,

  NotFoundException,

  Param,

  Patch,

  Post,

  RawBodyRequest,

  Req,

  Res,

  UnauthorizedException,

  Query,

} from "@nestjs/common";

import { ConfigService } from "@nestjs/config";

import type { Request, Response } from "express";

import { CicdService } from "./cicd.service";

import { CoolifyServersService } from "./coolify-servers.service";
import { ProvisionBundleService } from "./provision-bundle.service";

import { DeployRunsService } from "./deploy-runs.service";

import { ServicesService } from "./services.service";

import { DeployRequestDto, DeployResult } from "./dto/deploy.dto";

import { ProvisionDeploymentDto } from "./dto/provision.dto";

import { CreateServiceDto, UpdateServiceDto } from "./dto/service.dto";

import { CreateCoolifyServerDto } from "./dto/create-coolify-server.dto";

import { VerifyGitHubAccessDto } from "./dto/verify-github.dto";

import { ServiceBranchSyncService } from "./service-branch-sync.service";
import { ServerPreflightService } from "./server-preflight.service";
import { ReconcileServerDto } from "./dto/reconcile.dto";
import { DeploymentWizardService } from "./deployment-wizard.service";
import { UpdateDeploymentDto } from "./dto/update-deployment.dto";

import { DeployServiceRecord } from "./services.types";

import { GitHubService } from "../common/secrets/github.service";

import { CurrentTenant, type TenantContext } from "../common/tenant/tenant-context";

import { verifyHmacSignature } from "../common/security/signature.util";



@Controller("cicd")

export class CicdController {

  constructor(

    private readonly cicd: CicdService,

    private readonly coolifyServers: CoolifyServersService,

    private readonly provisionBundle: ProvisionBundleService,

    private readonly deployRuns: DeployRunsService,

    private readonly services: ServicesService,

    private readonly branchSync: ServiceBranchSyncService,

    private readonly github: GitHubService,

    private readonly preflight: ServerPreflightService,

    private readonly deploymentWizard: DeploymentWizardService,

    private readonly config: ConfigService

  ) {}



  @Get("services")

  async listServices(@CurrentTenant() tenant: TenantContext): Promise<DeployServiceRecord[]> {

    return this.services.list(tenant.tenantId);

  }



  @Post("services")

  @HttpCode(201)

  async createService(

    @Body() dto: CreateServiceDto,

    @CurrentTenant() tenant: TenantContext

  ): Promise<DeployServiceRecord> {

    return this.services.create(tenant.tenantId, dto);

  }



  @Patch("services/:id")

  async updateService(

    @Param("id") id: string,

    @Body() dto: UpdateServiceDto,

    @CurrentTenant() tenant: TenantContext

  ): Promise<DeployServiceRecord> {

    const updated = await this.services.updateConfig(tenant.tenantId, id, dto);

    if (!updated) throw new NotFoundException("Service not found");

    await this.branchSync.syncBranches(tenant.tenantId, id, {
      staging: dto.stagingBranch ?? dto.branch,
      production: dto.productionBranch ?? dto.branch,
    });

    return updated;

  }



  /** Load wizard state for an existing deployment (edit mode). */
  @Get("services/:id/wizard")
  async getDeploymentWizard(
    @Param("id") id: string,
    @CurrentTenant() tenant: TenantContext
  ) {
    return this.deploymentWizard.getConfig(tenant.tenantId, id);
  }

  /** Save wizard changes for an existing deployment. */
  @Patch("services/:id/deployment")
  async updateDeployment(
    @Param("id") id: string,
    @Body() dto: UpdateDeploymentDto,
    @CurrentTenant() tenant: TenantContext
  ) {
    return this.deploymentWizard.updateDeployment(tenant.tenantId, id, dto);
  }

  /** GitHub Actions image-build status for the latest commit on an environment branch. */
  @Get("services/:id/ci-readiness")
  async getCiReadiness(
    @Param("id") id: string,
    @Query("environment") environment: string,
    @Query("ref") ref: string | undefined,
    @CurrentTenant() tenant: TenantContext
  ) {
    if (environment !== "staging" && environment !== "production") {
      throw new BadRequestException("environment must be staging or production");
    }
    return this.cicd.getCiReadiness(tenant.tenantId, id, environment, ref);
  }



  /** Deployment targets: tenant-registered servers + platform localhost. */
  @Get("coolify/servers")
  async listCoolifyServers(@CurrentTenant() tenant: TenantContext) {
    return this.coolifyServers.listForTenant(tenant.tenantId);
  }

  /** Register an EC2 / remote server with Coolify (tenant never opens Coolify UI). */
  @Post("coolify/servers")
  @HttpCode(201)
  async registerCoolifyServer(
    @Body() dto: CreateCoolifyServerDto,
    @CurrentTenant() tenant: TenantContext
  ) {
    return this.coolifyServers.register(tenant.tenantId, dto);
  }

  @Get("coolify/servers/:uuid")
  async getCoolifyServer(
    @Param("uuid") uuid: string,
    @CurrentTenant() tenant: TenantContext
  ) {
    return this.coolifyServers.getStatus(uuid, tenant.tenantId);
  }

  /** Wizard gate — trigger SSH/Docker validation and wait for readiness. */
  @Post("coolify/servers/:uuid/validate")
  @HttpCode(200)
  async validateCoolifyServer(
    @Param("uuid") uuid: string,
    @CurrentTenant() tenant: TenantContext
  ) {
    return this.coolifyServers.validateAndWait(uuid, tenant.tenantId);
  }

  /**
   * Read-only preflight scan — reports running containers, port/proxy holders,
   * data volumes, and takeover conflicts. Never mutates the host.
   */
  @Post("coolify/servers/:uuid/preflight")
  @HttpCode(200)
  async preflightServer(
    @Param("uuid") uuid: string,
    @CurrentTenant() tenant: TenantContext
  ) {
    return this.preflight.scan(uuid, tenant.tenantId);
  }

  /**
   * Consent-gated reconciliation — stops/removes the legacy containers the caller
   * approved (data volumes preserved) and optionally sets the Coolify proxy to none.
   */
  @Post("coolify/servers/:uuid/reconcile")
  @HttpCode(200)
  async reconcileServer(
    @Param("uuid") uuid: string,
    @Body() dto: ReconcileServerDto,
    @CurrentTenant() tenant: TenantContext
  ) {
    return this.preflight.reconcile(uuid, tenant.tenantId, {
      stopContainers: dto.stopContainers,
      setProxyNone: dto.setProxyNone,
      retargetDeadNginxUpstreamsTo: dto.retargetDeadNginxUpstreamsTo,
    });
  }

  /** Wizard Access step — confirm PAT can read the repo before provisioning. */
  @Post("github/verify-access")
  @HttpCode(200)
  async verifyGitHubAccess(@Body() dto: VerifyGitHubAccessDto) {
    return this.github.verifyRepoAccess(dto.repo, dto.githubToken);
  }

  /**
   * Full wizard submit: create service + provision staging and production on
   * separate Coolify servers (EC2, localhost, etc.).
   */
  @Post("provision")
  @HttpCode(201)
  async provisionDeployment(
    @Body() dto: ProvisionDeploymentDto,
    @CurrentTenant() tenant: TenantContext
  ) {
    return this.provisionBundle.provision(tenant.tenantId, dto);
  }

  @Post("deploy")

  @HttpCode(202)

  async deploy(

    @Body() dto: DeployRequestDto,

    @CurrentTenant() tenant: TenantContext

  ): Promise<DeployResult> {

    return this.cicd.deploy(dto, tenant);

  }



  /** Recent deploy activity for the tenant (sidebar / audit). */
  @Get("deploy-runs")
  async listDeployRuns(@CurrentTenant() tenant: TenantContext) {
    return this.deployRuns.listByTenant(tenant.tenantId, 25);
  }

  /** Current status of a deploy run (polling fallback). */

  @Get("deployments/:id")

  async getDeployment(

    @Param("id") id: string,

    @CurrentTenant() tenant: TenantContext

  ) {

    const run = await this.deployRuns.get(tenant.tenantId, id);

    if (!run) throw new NotFoundException("Deployment not found");

    return run;

  }



  /**

   * SSE stream of deploy status transitions for the UI.

   * Emits the current snapshot immediately, then pushes updates until terminal.

   */

  @Get("deployments/:id/stream")

  async streamDeployment(

    @Param("id") id: string,

    @CurrentTenant() tenant: TenantContext,

    @Res() res: Response

  ): Promise<void> {

    const run = await this.deployRuns.get(tenant.tenantId, id);

    if (!run) {

      res.status(404).json({ message: "Deployment not found" });

      return;

    }



    res.setHeader("Content-Type", "text/event-stream");

    res.setHeader("Cache-Control", "no-cache");

    res.setHeader("Connection", "keep-alive");

    res.flushHeaders?.();



    const send = (payload: unknown) => {

      res.write(`data: ${JSON.stringify(payload)}\n\n`);

    };



    send({ type: "status", run });



    const terminal = (status: string) => status === "success" || status === "failed";

    if (terminal(run.status)) {

      send({ type: "done", run });

      res.end();

      return;

    }



    const unsubscribe = this.deployRuns.subscribe(id, (updated) => {

      send({ type: "status", run: updated });

      if (terminal(updated.status)) {

        send({ type: "done", run: updated });

        unsubscribe();

        res.end();

      }

    });



    const heartbeat = setInterval(() => res.write(": ping\n\n"), 15_000);

    res.on("close", () => {

      clearInterval(heartbeat);

      unsubscribe();

    });

  }



  /**

   * Coolify status ingress. Accepts:

   *  - HMAC-signed payloads (X-Coolify-Signature) when COOLIFY_WEBHOOK_SECRET is set

   *  - Coolify notification webhooks ({ event: "deployment_success", ... }) when secret unset

   */

  @Post("webhooks/coolify")

  @HttpCode(200)

  async coolifyWebhook(

    @Req() req: RawBodyRequest<Request>,

    @Headers("x-coolify-signature") signature: string | undefined,

    @Body() body: Record<string, unknown>

  ): Promise<{ received: true }> {

    const secret = this.config.get<string>("COOLIFY_WEBHOOK_SECRET") ?? "";

    const rawBody = req.rawBody ?? Buffer.from("");



    if (secret) {

      const valid = verifyHmacSignature({

        payload: rawBody,

        signature,

        secret,

        algorithm: "sha256",

        prefix: "sha256=",

      });

      if (!valid) throw new UnauthorizedException("Invalid Coolify webhook signature");

    }



    const payload = Object.keys(body).length > 0 ? body : this.parseJsonBody(rawBody);

    if (payload.event) {

      await this.cicd.handleCoolifyNotification(payload);

    }



    return { received: true };

  }



  private parseJsonBody(raw: Buffer): Record<string, unknown> {

    try {

      return JSON.parse(raw.toString("utf8")) as Record<string, unknown>;

    } catch {

      return {};

    }

  }

}


