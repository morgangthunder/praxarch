import { Module } from "@nestjs/common";
import { MarketingService } from "./marketing.service";
import { ContentService } from "./content.service";
import { ContentController } from "./content.controller";
import { AdapterRegistry } from "./adapter.registry";
import { UnifiedToAdapter } from "./adapters/unified-to.adapter";
import { MetaNativeAdapter } from "./adapters/meta-native.adapter";

/**
 * Marketing OS module. Adapters are registered as providers; the registry
 * resolves the right one per brand at runtime. Adding a new platform = add an
 * adapter here, nothing else changes.
 */
@Module({
  controllers: [ContentController],
  providers: [MarketingService, ContentService, AdapterRegistry, UnifiedToAdapter, MetaNativeAdapter],
  exports: [MarketingService, AdapterRegistry],
})
export class MarketingModule {}
