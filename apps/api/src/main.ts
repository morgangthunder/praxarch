import { NestFactory } from "@nestjs/core";
import { Logger, ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";
import { API_VERSION } from "./version";

// Re-exported for backwards compatibility; canonical value lives in version.ts.
export { API_VERSION };

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // rawBody is required so webhook controllers can verify HMAC signatures
    // against the exact bytes the provider signed.
    rawBody: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );

  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? "").split(",").filter(Boolean),
    credentials: true,
  });

  const port = process.env.PORT ?? 3901;
  await app.listen(port);
  Logger.log(`🚀 Praxarch API v${API_VERSION} listening on :${port}`, "Bootstrap");
}

void bootstrap();
