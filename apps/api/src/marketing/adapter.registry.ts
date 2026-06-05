import { Injectable, NotFoundException } from "@nestjs/common";
import { SocialMediaAdapter } from "./adapters/social-media.adapter";
import { UnifiedToAdapter } from "./adapters/unified-to.adapter";
import { MetaNativeAdapter } from "./adapters/meta-native.adapter";

/**
 * Selects the right plumbing per brand at runtime.
 *
 * This is where "swap Unified.to → native Meta for high-volume clients" happens
 * — a configuration decision, not a code change in the Brain or Marketing OS.
 */
@Injectable()
export class AdapterRegistry {
  private readonly adapters: Map<string, SocialMediaAdapter>;

  constructor(unified: UnifiedToAdapter, meta: MetaNativeAdapter) {
    this.adapters = new Map([
      [unified.key, unified],
      [meta.key, meta],
    ]);
  }

  /**
   * Resolve the adapter for a brand. In production this reads the brand's
   * `distribution_strategy` from its tenant schema; here it defaults to Unified.to.
   */
  forBrand(brandId: string, strategy?: string): SocialMediaAdapter {
    const key = strategy ?? "unified.to";
    const adapter = this.adapters.get(key);
    if (!adapter) {
      throw new NotFoundException(`No distribution adapter '${key}' for brand ${brandId}`);
    }
    return adapter;
  }

  all(): SocialMediaAdapter[] {
    return [...this.adapters.values()];
  }
}
