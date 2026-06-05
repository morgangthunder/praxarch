import { MiddlewareConsumer, Module, NestModule, RequestMethod } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { CicdModule } from "./cicd/cicd.module";
import { WhatsappModule } from "./whatsapp/whatsapp.module";
import { MarketingModule } from "./marketing/marketing.module";
import { TenantResolverMiddleware } from "./common/tenant/tenant-resolver.middleware";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CicdModule,
    WhatsappModule,
    MarketingModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Tenant resolution applies to all routes EXCEPT inbound vendor webhooks,
    // which authenticate via signature + payload, not a user session.
    consumer
      .apply(TenantResolverMiddleware)
      .exclude(
        { path: "cicd/webhooks/(.*)", method: RequestMethod.ALL },
        { path: "whatsapp/webhooks/(.*)", method: RequestMethod.ALL }
      )
      .forRoutes("*");
  }
}
