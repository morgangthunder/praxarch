import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { CapabilityService } from "./capability.service";
import { CapabilitySummary, CapabilityResult } from "./capability.types";
import { InvokeCapabilityDto } from "./dto/invoke.dto";
import { CurrentTenant, type TenantContext } from "../common/tenant/tenant-context";

@Controller("capabilities")
export class CapabilityController {
  constructor(private readonly capabilities: CapabilityService) {}

  /** Discover the capability catalogue (for the UI command bar + assistant tools). */
  @Get()
  list(): CapabilitySummary[] {
    return this.capabilities.list();
  }

  /** Invoke a capability from the UI (authenticated user). */
  @Post(":id/invoke")
  invoke(
    @Param("id") id: string,
    @Body() dto: InvokeCapabilityDto,
    @CurrentTenant() tenant: TenantContext
  ): Promise<CapabilityResult> {
    return this.capabilities.dispatch(id, dto.input ?? {}, {
      tenant,
      source: "ui",
      requestApproval: dto.requestApproval,
      actor: tenant.accountId,
    });
  }
}
