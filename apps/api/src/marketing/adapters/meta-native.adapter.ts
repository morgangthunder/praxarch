import { Injectable } from "@nestjs/common";
import { SocialMediaAdapter } from "./social-media.adapter";
import {
  AdapterCapabilities,
  PublishResult,
  UniversalContentAction,
} from "../contracts";

/**
 * Phase-2 plumbing (skeleton): a direct Meta Graph API adapter for high-volume
 * brands. It implements the SAME `SocialMediaAdapter` contract, so the registry
 * can swap it in for `UnifiedToAdapter` per-brand with zero changes to the Brain
 * or the Marketing OS service.
 *
 * Pricing model is "native": no per-post middleware fee (only the tenant's own
 * Meta ad spend / API usage), which the Credit Engine accounts for differently.
 */
@Injectable()
export class MetaNativeAdapter extends SocialMediaAdapter {
  readonly key = "meta.native";

  capabilities(): AdapterCapabilities {
    return {
      name: "Meta (native Graph API)",
      supportedPlatforms: ["facebook", "instagram"],
      supportsScheduling: true,
      maxMediaPerPost: 10,
      pricing: { model: "native" },
    };
  }

  async healthCheck(_brandId: string): Promise<boolean> {
    // TODO: validate the brand's long-lived page access token against /me.
    return false;
  }

  async publish(action: UniversalContentAction): Promise<PublishResult> {
    this.assertPlatformsSupported(action.platforms);
    // TODO: implement Graph API container-create + publish per platform.
    throw new Error("MetaNativeAdapter.publish not yet implemented (Phase 2 swap target).");
  }
}
