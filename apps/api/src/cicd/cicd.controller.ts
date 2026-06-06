import {

  Body,

  Controller,

  Get,

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

} from "@nestjs/common";

import { ConfigService } from "@nestjs/config";

import type { Request, Response } from "express";

import { CicdService } from "./cicd.service";

import { DeployRunsService } from "./deploy-runs.service";

import { ServicesService } from "./services.service";

import { DeployRequestDto, DeployResult } from "./dto/deploy.dto";

import { CreateServiceDto, UpdateServiceDto } from "./dto/service.dto";

import { DeployServiceRecord } from "./services.types";

import { CurrentTenant, type TenantContext } from "../common/tenant/tenant-context";

import { verifyHmacSignature } from "../common/security/signature.util";



@Controller("cicd")

export class CicdController {

  constructor(

    private readonly cicd: CicdService,

    private readonly deployRuns: DeployRunsService,

    private readonly services: ServicesService,

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

    return updated;

  }



  @Post("deploy")

  @HttpCode(202)

  async deploy(

    @Body() dto: DeployRequestDto,

    @CurrentTenant() tenant: TenantContext

  ): Promise<DeployResult> {

    return this.cicd.deploy(dto, tenant);

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


