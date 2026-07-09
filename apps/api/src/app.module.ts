import { MiddlewareConsumer, Module, NestModule, RequestMethod } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DatabaseModule } from "./common/database/database.module";
import { CicdModule } from "./cicd/cicd.module";
import { WhatsappModule } from "./whatsapp/whatsapp.module";
import { MarketingModule } from "./marketing/marketing.module";
import { SettingsModule } from "./settings/settings.module";
import { CapabilityModule } from "./capabilities/capability.module";
import { PromptRegistryModule } from "./prompts/prompt-registry.module";
import { AssistantModule } from "./assistant/assistant.module";
import { HealthController } from "./health/health.controller";
import { TenantResolverMiddleware } from "./common/tenant/tenant-resolver.middleware";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    SettingsModule,
    CicdModule,
    WhatsappModule,
    MarketingModule,
    CapabilityModule,
    PromptRegistryModule,
    AssistantModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Tenant resolution applies to all routes EXCEPT inbound vendor webhooks
    // (authenticate via signature + payload) and the health probe (no session).
    consumer
      .apply(TenantResolverMiddleware)
      .exclude(
        { path: "health", method: RequestMethod.ALL },
        { path: "cicd/webhooks/(.*)", method: RequestMethod.ALL },
        { path: "whatsapp/webhooks/(.*)", method: RequestMethod.ALL }
      )
      .forRoutes("*");
  }
}
