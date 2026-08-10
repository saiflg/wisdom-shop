import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { configureApp } from "./bootstrap";
import type { EnvConfig } from "./config/env.validation";

async function bootstrap() {
  // rawBody is required for fee-payment webhook signature verification: the
  // signature covers the exact bytes the provider sent, so anything that
  // re-encodes the body — including JSON.parse followed by stringify —
  // invalidates it. Same reason the shop's own API sets this.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  configureApp(app);

  const config = app.get(ConfigService<EnvConfig, true>);
  const isProduction = config.get("NODE_ENV", { infer: true }) === "production";

  app.enableShutdownHooks();

  const swaggerEnabled = !isProduction || config.get("SWAGGER_ENABLED", { infer: true });
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("Wisdom Campus EMS API")
      .setDescription("School management API — platform (school onboarding) and tenant (school-scoped) routes")
      .setVersion("0.1.0")
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("docs", app, document);
  }

  const port = config.get("PORT", { infer: true });
  await app.listen(port, "0.0.0.0");
  // eslint-disable-next-line no-console
  console.log(
    `Wisdom Campus EMS API listening on port ${port}${swaggerEnabled ? " (docs at /docs)" : ""}`,
  );
}

bootstrap();
