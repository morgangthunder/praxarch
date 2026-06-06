import { Body, Controller, ForbiddenException, HttpCode, Post } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { WhatsappService } from "./whatsapp.service";
import { WorkspaceSettingsService } from "../settings/workspace-settings.service";
import { CurrentTenant, type TenantContext } from "../common/tenant/tenant-context";

interface DevApproveBody {
  /** Approver WA id; defaults to the tenant's configured approver. */
  approverWaId?: string;
  /** Reply text to simulate (defaults to "YES"). */
  reply?: string;
}

/**
 * DEV ONLY. Stands in for an inbound Twilio reply so the promote/publish ->
 * approve -> execute loop is exercisable locally without Twilio. Hard-gated to
 * AUTH_PROVIDER=none; never mounted behind a real auth provider's value.
 */
@Controller("whatsapp/dev")
export class WhatsappDevController {
  constructor(
    private readonly whatsapp: WhatsappService,
    private readonly settings: WorkspaceSettingsService,
    private readonly config: ConfigService
  ) {}

  @Post("approve")
  @HttpCode(200)
  async approve(
    @Body() body: DevApproveBody,
    @CurrentTenant() tenant: TenantContext
  ): Promise<{ resolved: boolean }> {
    if (this.config.get<string>("AUTH_PROVIDER") !== "none") {
      throw new ForbiddenException("Dev approve is disabled outside AUTH_PROVIDER=none");
    }
    const approver = body.approverWaId ?? (await this.settings.resolveApprover(tenant.tenantId, "deploy"));
    return this.whatsapp.handleInboundReply(approver, body.reply ?? "YES");
  }
}
