import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { ContentService } from "./content.service";
import { CreateContentDto, UpdateContentStatusDto } from "./dto/content.dto";
import { ContentDraftRecord } from "./content.types";
import { CurrentTenant, type TenantContext } from "../common/tenant/tenant-context";

/** CRUD for the AI content pipeline (per tenant). Publishing goes via the HITL flow. */
@Controller("marketing")
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Get("content")
  async list(@CurrentTenant() tenant: TenantContext): Promise<ContentDraftRecord[]> {
    return this.content.list(tenant.tenantId);
  }

  @Post("content")
  @HttpCode(201)
  async create(
    @Body() dto: CreateContentDto,
    @CurrentTenant() tenant: TenantContext
  ): Promise<ContentDraftRecord> {
    return this.content.create(tenant.tenantId, dto);
  }

  @Patch("content/:id")
  async updateStatus(
    @Param("id") id: string,
    @Body() dto: UpdateContentStatusDto,
    @CurrentTenant() tenant: TenantContext
  ): Promise<ContentDraftRecord> {
    const updated = await this.content.updateStatus(tenant.tenantId, id, dto.status);
    if (!updated) throw new NotFoundException("Content not found");
    return updated;
  }
}
