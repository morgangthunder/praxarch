import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  RawBodyRequest,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import { CicdService } from "./cicd.service";
import { DeployRequestDto, DeployResult } from "./dto/deploy.dto";
import { CurrentTenant, type TenantContext } from "../common/tenant/tenant-context";
import { verifyHmacSignature } from "../common/security/signature.util";

@Controller("cicd")
export class CicdController {
  constructor(
    private readonly cicd: CicdService,
    private readonly config: ConfigService
  ) {}

  /**
   * One-Button Deploy entrypoint. Called by the Next.js BFF (authenticated user).
   * RBAC + production gating live in the service.
   */
  @Post("deploy")
  @HttpCode(202)
  async deploy(
    @Body() dto: DeployRequestDto,
    @CurrentTenant() tenant: TenantContext
  ): Promise<DeployResult> {
    return this.cicd.deploy(dto, tenant);
  }

  /**
   * Coolify status webhook (deploy started/succeeded/failed).
   * Signature-verified against the raw body before any processing.
   */
  @Post("webhooks/coolify")
  @HttpCode(200)
  async coolifyWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers("x-coolify-signature") signature: string | undefined
  ): Promise<{ received: true }> {
    const secret = this.config.get<string>("COOLIFY_WEBHOOK_SECRET") ?? "";
    const rawBody = req.rawBody ?? Buffer.from("");

    const valid = verifyHmacSignature({
      payload: rawBody,
      signature,
      secret,
      algorithm: "sha256",
      prefix: "sha256=",
    });
    if (!valid) {
      throw new UnauthorizedException("Invalid Coolify webhook signature");
    }

    // Persist status → emit `deploy.status.changed` for the UI to stream.
    // (Event bus wiring omitted in scaffolding.)
    return { received: true };
  }
}
