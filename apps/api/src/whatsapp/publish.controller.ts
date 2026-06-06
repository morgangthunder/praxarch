import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { WhatsappService } from "./whatsapp.service";
import { WorkspaceSettingsService } from "../settings/workspace-settings.service";
import { PublishRequestDto, PublishRequestResult } from "./dto/publish-request.dto";
import { CurrentTenant, type TenantContext } from "../common/tenant/tenant-context";

/**
 * Content publish *request* endpoint. Opens a WhatsApp HITL checkpoint; the
 * approver's reply publishes via the Marketing OS (mirror of `cicd/promote-request`).
 */
@Controller("marketing")
export class PublishController {
  constructor(
    private readonly whatsapp: WhatsappService,
    private readonly settings: WorkspaceSettingsService
  ) {}

  @Post("publish-request")
  @HttpCode(202)
  async publishRequest(
    @Body() dto: PublishRequestDto,
    @CurrentTenant() tenant: TenantContext
  ): Promise<PublishRequestResult> {
    const approverWaId = await this.settings.resolveApprover(tenant.tenantId, "content");

    const summary =
      dto.summary ??
      `Publish content to ${dto.platforms.join(", ")}\nRequested by ${tenant.accountId}.`;

    const checkpoint = await this.whatsapp.openContentCheckpoint({
      tenantId: tenant.tenantId,
      content: {
        brandId: dto.brandId,
        platforms: dto.platforms,
        caption: dto.caption,
        hashtags: dto.hashtags,
        scheduledAt: dto.scheduledAt,
      },
      summary,
      approverWaId,
    });

    return { checkpointId: checkpoint.id, status: "awaiting_approval" };
  }
}
