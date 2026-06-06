import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { WhatsappService } from "./whatsapp.service";
import { WorkspaceSettingsService } from "../settings/workspace-settings.service";
import { PromoteRequestDto, PromoteRequestResult } from "./dto/promote-request.dto";
import { CurrentTenant, type TenantContext } from "../common/tenant/tenant-context";

/**
 * Promote-to-production *request* endpoint (the Member path).
 *
 * Lives in the WhatsApp module because the approval and the eventual deploy are
 * both orchestrated by the HITL engine. Grouped under the `cicd` prefix alongside
 * the direct `cicd/deploy` (Owner) endpoint.
 */
@Controller("cicd")
export class PromoteController {
  constructor(
    private readonly whatsapp: WhatsappService,
    private readonly settings: WorkspaceSettingsService
  ) {}

  @Post("promote-request")
  @HttpCode(202)
  async promoteRequest(
    @Body() dto: PromoteRequestDto,
    @CurrentTenant() tenant: TenantContext
  ): Promise<PromoteRequestResult> {
    // Approver resolved from the tenant's workspace settings (env fallback).
    const approverWaId = await this.settings.resolveApprover(tenant.tenantId, "deploy");

    const summary =
      dto.summary ??
      `Promote *${dto.project}* to *${dto.environment}*` +
        (dto.ref ? ` (ref ${dto.ref})` : "") +
        `\nRequested by ${tenant.accountId}.`;

    const checkpoint = await this.whatsapp.openDeployCheckpoint({
      tenantId: tenant.tenantId,
      deploy: {
        project: dto.project,
        environment: dto.environment,
        ref: dto.ref,
        serviceId: dto.serviceId,
      },
      summary,
      approverWaId,
    });

    return { checkpointId: checkpoint.id, status: "awaiting_approval" };
  }
}
