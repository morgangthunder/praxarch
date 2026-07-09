import { Module } from "@nestjs/common";
import { SecretsModule } from "../common/secrets/secrets.module";
import { CicdModule } from "../cicd/cicd.module";
import { MarketingModule } from "../marketing/marketing.module";
import { WhatsappModule } from "../whatsapp/whatsapp.module";
import { SettingsModule } from "../settings/settings.module";
import { CapabilityController } from "./capability.controller";
import { CapabilityService } from "./capability.service";
import { CapabilityAuditService } from "./capability-audit.service";

/**
 * The Capability layer — a single registry of typed actions wrapping the
 * deployment, marketing, and WhatsApp services. Exported so the assistant
 * module can dispatch the same catalogue the UI uses.
 */
@Module({
  imports: [CicdModule, SecretsModule, MarketingModule, WhatsappModule, SettingsModule],
  controllers: [CapabilityController],
  providers: [CapabilityService, CapabilityAuditService],
  exports: [CapabilityService],
})
export class CapabilityModule {}
