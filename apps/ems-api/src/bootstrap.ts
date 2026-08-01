import type { INestApplication } from "@nestjs/common";
import { ValidationPipe, VersioningType } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import type { EnvConfig } from "./config/env.validation";
import { RejectNullBytesMiddleware } from "./common/middleware/reject-null-bytes.middleware";

/**
 * Shared between main.ts (real boot) and e2e tests, so both exercise
 * identical middleware/pipes — same reasoning as apps/api/src/bootstrap.ts.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService<EnvConfig, true>);

  const trustProxyHops = config.get("TRUST_PROXY_HOPS", { infer: true });
  app.getHttpAdapter().getInstance().set("trust proxy", trustProxyHops);

  app.use(helmet());
  app.use(cookieParser());
  const rejectNullBytes = new RejectNullBytesMiddleware();
  app.use(rejectNullBytes.use.bind(rejectNullBytes));
  app.enableCors({
    origin: config.get("APP_URL", { infer: true }),
    credentials: true,
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
