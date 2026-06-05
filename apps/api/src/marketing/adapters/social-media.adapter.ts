import {
  AdapterCapabilities,
  PublishResult,
  SocialPlatform,
  UniversalContentAction,
} from "../contracts";

/**
 * The Adapter Pattern seam for the Marketing OS.
 *
 * Every distribution backend (Unified.to today; native Meta/Google/TikTok
 * tomorrow) implements this single contract. The Marketing OS depends only on
 * this abstraction — swapping plumbing never touches content generation or
 * business logic.
 */
export abstract class SocialMediaAdapter {
  /** Stable identifier used by the registry + config (e.g. "unified.to"). */
  abstract readonly key: string;

  /** What this adapter can do — used for planning + credit estimation. */
  abstract capabilities(): AdapterCapabilities;

  /** Publish (or schedule) a universal content action. Must be idempotent on actionId. */
  abstract publish(action: UniversalContentAction): Promise<PublishResult>;

  /** Cheap connectivity/credential check for the given brand. */
  abstract healthCheck(brandId: string): Promise<boolean>;

  /** Default guard shared by all adapters: validate platform support up front. */
  protected assertPlatformsSupported(platforms: SocialPlatform[]): void {
    const supported = new Set(this.capabilities().supportedPlatforms);
    const unsupported = platforms.filter((p) => !supported.has(p));
    if (unsupported.length > 0) {
      throw new Error(`${this.key} does not support: ${unsupported.join(", ")}`);
    }
  }
}
