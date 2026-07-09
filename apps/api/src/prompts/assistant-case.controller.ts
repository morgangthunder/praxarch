import { Body, Controller, ForbiddenException, Get, Param, Put } from "@nestjs/common";
import { AssistantCaseService } from "./assistant-case.service";
import { UpdateCaseDto } from "./dto/update-case.dto";
import { CurrentTenant, type TenantContext } from "../common/tenant/tenant-context";

/** Super-Admin → AI model cases (provider, model, prompts, context toggles). */
@Controller("admin/ai-cases")
export class AssistantCaseController {
  constructor(private readonly cases: AssistantCaseService) {}

  private assertOperator(tenant: TenantContext): void {
    if (!tenant.roles.includes("platform:operator")) {
      throw new ForbiddenException("AI case config is restricted to platform operators.");
    }
  }

  @Get("meta")
  async meta(@CurrentTenant() tenant: TenantContext) {
    this.assertOperator(tenant);
    return {
      providers: await this.cases.listProviders(),
      contextFields: this.cases.listContextFields(),
    };
  }

  @Get()
  async list(@CurrentTenant() tenant: TenantContext) {
    this.assertOperator(tenant);
    return { cases: await this.cases.list() };
  }

  @Get(":caseKey")
  async get(@CurrentTenant() tenant: TenantContext, @Param("caseKey") caseKey: string) {
    this.assertOperator(tenant);
    const entry = await this.cases.get(caseKey);
    const resolved = await this.cases.resolve(caseKey);
    return { ...entry, resolvedBaseUrl: resolved.resolvedBaseUrl, providerConfigured: resolved.providerConfigured };
  }

  @Put(":caseKey")
  async update(
    @CurrentTenant() tenant: TenantContext,
    @Param("caseKey") caseKey: string,
    @Body() dto: UpdateCaseDto
  ) {
    this.assertOperator(tenant);
    return this.cases.update(caseKey, dto);
  }
}
