/**
 * Universal Action contracts — the vendor-neutral language between the
 * "Brain" (MoM agents) and the "Plumbing" (adapters).
 *
 * The Brain emits these. Adapters map them onto specific vendor APIs.
 * Neither side knows the other's dialect — this is the core of
 * "Modular Brain, Universal Plumbing".
 */

export type SocialPlatform =
  | "instagram"
  | "facebook"
  | "linkedin"
  | "tiktok"
  | "x"
  | "youtube";

export interface MediaAsset {
  kind: "image" | "video";
  /** Pre-uploaded asset URL (S3/CDN) the adapter can reference or re-upload. */
  url: string;
  mimeType: string;
  /** Optional accessibility text. */
  altText?: string;
}

/** A piece of content the Brain wants published. Vendor-agnostic. */
export interface UniversalContentAction {
  /** Idempotency key — adapters must dedupe on this. */
  actionId: string;
  tenantId: string;
  /** Logical brand/account within the tenant. */
  brandId: string;
  platforms: SocialPlatform[];
  caption: string;
  hashtags?: string[];
  media: MediaAsset[];
  /** ISO time to publish; omit for immediate. */
  scheduledAt?: string;
  /** Free-form, platform-neutral hints (e.g. firstComment, link). */
  options?: Record<string, unknown>;
}

/** Normalized per-platform outcome returned by every adapter. */
export interface PlatformPublishResult {
  platform: SocialPlatform;
  status: "published" | "scheduled" | "failed";
  /** Vendor's post id, when available. */
  externalId?: string;
  permalink?: string;
  error?: string;
  /** Provider cost attributable to this post (for the Credit Engine). */
  costEur?: number;
}

export interface PublishResult {
  actionId: string;
  results: PlatformPublishResult[];
  /** Aggregate provider cost across platforms (drives credit settlement). */
  totalCostEur: number;
}

/** Capabilities an adapter advertises so the Brain can plan within limits. */
export interface AdapterCapabilities {
  name: string;
  supportedPlatforms: SocialPlatform[];
  supportsScheduling: boolean;
  maxMediaPerPost: number;
  /** Pricing model surfaced to the Credit Engine for estimation. */
  pricing: { model: "usage" | "flat" | "native"; perPostEur?: number };
}

export class AdapterError extends Error {
  constructor(
    message: string,
    readonly platform: SocialPlatform | "all",
    readonly retryable: boolean
  ) {
    super(message);
    this.name = "AdapterError";
  }
}
