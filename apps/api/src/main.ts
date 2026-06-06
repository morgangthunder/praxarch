import { NestFactory } from "@nestjs/core";
import { Logger, ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";

// Surfaced on every boot so you can confirm the running build (per project convention).
export const API_VERSION = "0.7.0";

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
