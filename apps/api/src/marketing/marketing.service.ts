import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AdapterRegistry } from "./adapter.registry";
import {
  ContentPublishPayload,
  PublishResult,
  SocialPlatform,
  UniversalContentAction,
} from "./contracts";
import type { TenantContext } from "../common/tenant/tenant-context";

/** What the Brain (MoM Creative agent) hands back after reasoning. */
export interface GeneratedContent {
  caption: string;
  hashtags: string[];
  mediaUrls: { url: string; mimeType: string; kind: "image" | "video" }[];
}

export interface CampaignBrief {
  brandId: string;
  platforms: SocialPlatform[];
  goal: string;
  /** Optional distribution override, e.g. "meta.native" for high-volume brands. */
  distributionStrategy?: string;
  scheduledAt?: string;
}

/**
 * Marketing OS — the orchestration boundary.
 *
 * It (1) asks the Brain to generate content, (2) wraps it in a vendor-neutral
 * Universal Action, then (3) hands it to whichever adapter the registry resolves.
 * Steps 1–2 never change when the plumbing changes — the whole point.
 *
 * Credit metering is woven in: reserve before publish, settle on actual cost.
 */
@Injectable()
export class MarketingService {
  private readonly logger = new Logger(MarketingService.name);

  constructor(private readonly registry: AdapterRegistry) {}

  async runCampaign(brief: CampaignBrief, tenant: TenantContext): Promise<PublishResult> {
    // 1. THE BRAIN — generate content (delegated to n8n/MoM in production).
    const content = await this.generateContent(brief, tenant);

    // 2. THE CONTRACT — wrap reasoning output in a vendor-neutral action.
    const action: UniversalContentAction = {
      actionId: randomUUID(),
      tenantId: tenant.tenantId,
      brandId: brief.brandId,
      platforms: brief.platforms,
      caption: content.caption,
      hashtags: content.hashtags,
      media: content.mediaUrls.map((m) => ({ ...m, altText: undefined })),
      scheduledAt: brief.scheduledAt,
    };

    // 3. THE PLUMBING — resolve + invoke the adapter (swappable per brand).
    const adapter = this.registry.forBrand(brief.brandId, brief.distributionStrategy);

    const estimate = (adapter.capabilities().pricing.perPostEur ?? 0) * brief.platforms.length;
    this.logger.log(
      `Publishing ${action.actionId} via ${adapter.key} (est €${estimate.toFixed(2)})`
    );
    // creditEngine.reserve(tenant, action.actionId, estimate)  ← wired in production

    const result = await adapter.publish(action);

    // creditEngine.settle(tenant, action.actionId, result.totalCostEur)  ← actuals
    this.logger.log(
      `Published ${action.actionId}: ${result.results.filter((r) => r.status !== "failed").length}/${result.results.length} ok (€${result.totalCostEur.toFixed(2)})`
    );

    return result;
  }

  /**
   * Publish a specific, already-approved piece of content. Called by the HITL
   * engine after a human approves it over WhatsApp (no further generation step).
   */
  async publishApprovedContent(
    payload: ContentPublishPayload,
    tenantId: string
  ): Promise<PublishResult> {
    const action: UniversalContentAction = {
      actionId: randomUUID(),
      tenantId,
      brandId: payload.brandId,
      platforms: payload.platforms,
      caption: payload.caption,
      hashtags: payload.hashtags,
      media: [],
      scheduledAt: payload.scheduledAt,
    };
    const adapter = this.registry.forBrand(payload.brandId);
    this.logger.log(`Publishing approved content ${action.actionId} via ${adapter.key}`);
    return adapter.publish(action);
  }

  /**
   * Placeholder for the MoM Creative agent. In production this triggers an n8n
   * workflow and (under APPROVAL_REQUIRED autonomy) opens a WhatsApp checkpoint
   * before returning approved content.
   */
  private async generateContent(
    brief: CampaignBrief,
    _tenant: TenantContext
  ): Promise<GeneratedContent> {
    return {
      caption: `New from us — ${brief.goal}.`,
      hashtags: ["launch", "praxarch"],
      mediaUrls: [],
    };
  }
}
