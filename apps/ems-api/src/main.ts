import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { configureApp } from "./bootstrap";
import type { EnvConfig } from "./config/env.validation";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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
