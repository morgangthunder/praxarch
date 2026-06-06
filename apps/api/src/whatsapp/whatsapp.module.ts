import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { WhatsappController } from "./whatsapp.controller";
import { PromoteController } from "./promote.controller";
import { PublishController } from "./publish.controller";
import { WhatsappService } from "./whatsapp.service";
import { N8nClientService } from "./n8n-client.service";
import {
  CheckpointRepository,
  InMemoryCheckpointRepository,
  PgCheckpointRepository,
} from "./checkpoint.repository";
import { DatabaseService } from "../common/database/database.service";
import { CicdModule } from "../cicd/cicd.module";
import { MarketingModule } from "../marketing/marketing.module";
import { SettingsModule } from "../settings/settings.module";
import { WhatsappDevController } from "./whatsapp-dev.controller";

@Module({
  // CicdModule + MarketingModule export the services the HITL engine runs on approval
  // (deploy promote, content publish). SettingsModule resolves the approver.
  imports: [CicdModule, MarketingModule, SettingsModule],
  controllers: [WhatsappController, PromoteController, PublishController, WhatsappDevController],
  providers: [
    WhatsappService,
    N8nClientService,
    // Postgres-backed when DATABASE_URL is set; in-memory fallback otherwise.
    {
      provide: CheckpointRepository,
      useFactory: (config: ConfigService, db: DatabaseService) =>
        config.get<string>("DATABASE_URL")
          ? new PgCheckpointRepository(db)
          : new InMemoryCheckpointRepository(),
      inject: [ConfigService, DatabaseService],
    },
  ],
  exports: [WhatsappService],
})
export class WhatsappModule {}
