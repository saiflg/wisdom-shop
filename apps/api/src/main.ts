import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { configureApp } from "./bootstrap";
import type { EnvConfig } from "./config/env.validation";

async function bootstrap() {
  // rawBody is required for payment webhook signature verification, which is
  // computed over the exact bytes the provider sent.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  configureApp(app);

  const config = app.get(ConfigService<EnvConfig, true>);
  const isProduction = config.get("NODE_ENV", { infer: true }) === "production";

  // Containers are stopped with SIGTERM. Without shutdown hooks Nest never
  // runs onModuleDestroy, so Prisma's pool and BullMQ's connections are torn
  // down by process death mid-query rather than closed.
  app.enableShutdownHooks();

  // Swagger describes every route, its DTOs and its auth requirements. That
  // is a gift to an attacker and is not needed by any real client, so it is
  // served outside production only. Set SWAGGER_ENABLED=true to override for
  // a staging box that genuinely needs it.
  const swaggerEnabled = !isProduction || config.get("SWAGGER_ENABLED", { infer: true });
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("Wisdom Shop API")
      .setDescription("REST API for the Wisdom Shop educational marketplace")
      .setVersion("0.1.0")
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("docs", app, document);
  }

  const port = config.get("PORT", { infer: true });
  // Bind on all interfaces: the default binds loopback only in some Node
  // versions, which makes the container unreachable from the proxy.
  await app.listen(port, "0.0.0.0");
  // eslint-disable-next-line no-console
  console.log(
    `Wisdom Shop API listening on port ${port}${swaggerEnabled ? " (docs at /docs)" : ""}`,
  );
}

bootstrap();
