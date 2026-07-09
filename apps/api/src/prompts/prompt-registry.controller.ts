import { Body, Controller, ForbiddenException, Get, Param, Post, Put, Query } from "@nestjs/common";
import { PromptRegistryService } from "./prompt-registry.service";
import { CreatePromptDto } from "./dto/create-prompt.dto";
import { SavePromptDto } from "./dto/save-prompt.dto";
import type { PromptScope } from "./prompt-registry.types";
import { CurrentTenant, type TenantContext } from "../common/tenant/tenant-context";

/**
 * Super-Admin → Prompt Registry. Editing the platform-wide assistant prompts
 * (guardrails + persona) is an operator action, so it requires the platform
 * operator role. Tenant operators cannot change global guardrails.
 */
@Controller("admin/prompts")
export class PromptRegistryController {
  constructor(private readonly prompts: PromptRegistryService) {}

  private assertOperator(tenant: TenantContext): void {
    if (!tenant.roles.includes("platform:operator")) {
      throw new ForbiddenException("Prompt registry is restricted to platform operators.");
    }
  }

  @Get()
  async list(@CurrentTenant() tenant: TenantContext, @Query("scope") scope?: PromptScope) {
    this.assertOperator(tenant);
    return { prompts: await this.prompts.list(scope) };
  }

  @Post()
  async create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreatePromptDto) {
    this.assertOperator(tenant);
    return this.prompts.create(dto);
  }

  @Get(":key")
  async get(@CurrentTenant() tenant: TenantContext, @Param("key") key: string) {
    this.assertOperator(tenant);
    return this.prompts.get(key);
  }

  @Put(":key")
  async save(
    @CurrentTenant() tenant: TenantContext,
    @Param("key") key: string,
    @Body() dto: SavePromptDto
  ) {
    this.assertOperator(tenant);
    return this.prompts.save(key, dto.body);
  }
}
