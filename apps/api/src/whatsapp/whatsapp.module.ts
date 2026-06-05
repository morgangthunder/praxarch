import { Module } from "@nestjs/common";
import { WhatsappController } from "./whatsapp.controller";
import { WhatsappService } from "./whatsapp.service";
import { N8nClientService } from "./n8n-client.service";
import { CheckpointRepository, InMemoryCheckpointRepository } from "./checkpoint.repository";

@Module({
  controllers: [WhatsappController],
  providers: [
    WhatsappService,
    N8nClientService,
    // Swap InMemory → Postgres (tenant schema) implementation in production.
    { provide: CheckpointRepository, useClass: InMemoryCheckpointRepository },
  ],
  exports: [WhatsappService],
})
export class WhatsappModule {}
