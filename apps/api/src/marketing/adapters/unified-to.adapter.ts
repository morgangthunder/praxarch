import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SocialMediaAdapter } from "./social-media.adapter";
import {
  AdapterCapabilities,
  AdapterError,
  PlatformPublishResult,
  PublishResult,
  SocialPlatform,
  UniversalContentAction,
} from "../contracts";

/** Unified.to's per-post usage price (€) used for credit estimation/settlement. */
const PER_POST_EUR = 0.08;

/** Map our neutral platform names to Unified.to connection types. */
const PLATFORM_MAP: Record<SocialPlatform, string> = {
  instagram: "INSTAGRAM",
  facebook: "FACEBOOK",
  linkedin: "LINKEDIN",
  tiktok: "TIKTOK",
  x: "TWITTER",
  youtube: "YOUTUBE",
};

/**
 * Phase-1 plumbing: posts through the Unified.to middleware (usage-based,
 * ~€5–€10/brand). High deliverability, avoids per-platform bot bans.
 *
 * Resolves a per-brand connection id, fans out across platforms, and returns a
 * normalized PublishResult — including provider cost for the Credit Engine.
 */
@Injectable()
export class UnifiedToAdapter extends SocialMediaAdapter {
  readonly key = "unified.to";
  private readonly logger = new Logger(UnifiedToAdapter.name);

  constructor(private readonly config: ConfigService) {
    super();
  }

  capabilities(): AdapterCapabilities {
    return {
      name: "Unified.to",
      supportedPlatforms: ["instagram", "facebook", "linkedin", "tiktok", "x", "youtube"],
      supportsScheduling: true,
      maxMediaPerPost: 10,
      pricing: { model: "usage", perPostEur: PER_POST_EUR },
    };
  }

  async healthCheck(brandId: string): Promise<boolean> {
    try {
      const connectionId = await this.resolveConnectionId(brandId);
      return Boolean(connectionId);
    } catch {
      return false;
    }
  }

  async publish(action: UniversalContentAction): Promise<PublishResult> {
    this.assertPlatformsSupported(action.platforms);

    const connectionId = await this.resolveConnectionId(action.brandId);
    const text = [action.caption, (action.hashtags ?? []).map((h) => `#${h}`).join(" ")]
      .filter(Boolean)
      .join("\n\n");

    // Fan out per platform; isolate failures so one platform can't sink the batch.
    const results: PlatformPublishResult[] = await Promise.all(
      action.platforms.map((platform) =>
        this.postToPlatform({ platform, connectionId, text, action }).catch(
          (err): PlatformPublishResult => ({
            platform,
            status: "failed",
            error: err instanceof Error ? err.message : "unknown error",
          })
        )
      )
    );

    const totalCostEur = results
      .filter((r) => r.status !== "failed")
      .reduce((sum, r) => sum + (r.costEur ?? 0), 0);

    return { actionId: action.actionId, results, totalCostEur };
  }

  private async postToPlatform(params: {
    platform: SocialPlatform;
    connectionId: string;
    text: string;
    action: UniversalContentAction;
  }): Promise<PlatformPublishResult> {
    const { platform, connectionId, text, action } = params;
    const { baseUrl, apiKey } = this.creds();

    const payload = {
      type: PLATFORM_MAP[platform],
      text,
      media_urls: action.media.map((m) => m.url),
      schedule_date: action.scheduledAt,
    };

    const res = await fetch(`${baseUrl}/social/post?connection_id=${connectionId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // Unified.to honors an idempotency key to dedupe retries.
        "X-Idempotency-Key": `${action.actionId}:${platform}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });

    if (res.status === 429 || res.status >= 500) {
      throw new AdapterError(`Unified.to transient error (${res.status})`, platform, true);
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new AdapterError(`Unified.to rejected post (${res.status}): ${detail}`, platform, false);
    }

    const body = (await res.json().catch(() => ({}))) as { id?: string; permalink?: string };
    return {
      platform,
      status: action.scheduledAt ? "scheduled" : "published",
      externalId: body.id,
      permalink: body.permalink,
      costEur: PER_POST_EUR,
    };
  }

  /** Resolves the Unified.to connection id for a brand (would hit Vault/DB). */
  private async resolveConnectionId(brandId: string): Promise<string> {
    const mapped = this.config.get<string>(`UNIFIED_CONNECTION_${brandId.toUpperCase()}`);
    if (!mapped) {
      throw new AdapterError(`No Unified.to connection for brand ${brandId}`, "all", false);
    }
    return mapped;
  }

  private creds(): { baseUrl: string; apiKey: string } {
    const baseUrl = this.config.get<string>("UNIFIED_API_URL");
    const apiKey = this.config.get<string>("UNIFIED_API_KEY");
    if (!baseUrl || !apiKey) {
      throw new AdapterError("Unified.to not configured", "all", false);
    }
    return { baseUrl, apiKey };
  }
}
