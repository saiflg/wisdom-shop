import type { INestApplication } from "@nestjs/common";
import { ValidationPipe, VersioningType } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import type { EnvConfig } from "./config/env.validation";
import { RejectNullBytesMiddleware } from "./common/middleware/reject-null-bytes.middleware";

/**
 * Shared between main.ts (real boot) and e2e tests, so both exercise
 * identical middleware/pipes.
 *
 * NOTE: the app must be created with `{ rawBody: true }` (see main.ts and the
 * e2e suites). Payment providers sign the exact bytes they send, so webhook
 * signature checks need `req.rawBody`. Registering a second body parser here
 * to capture it does NOT work reliably — Nest registers its own parser during
 * init(), and depending on ordering the raw buffer ends up unset, which makes
 * every signature fail. Nest's built-in option is the dependable route.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService<EnvConfig, true>);

  // How many proxies sit in front. Express uses this to decide which entry
  // of X-Forwarded-For is the real client, which is what the rate limiter
  // and the audit log then key on. Zero (the default) means the header is
  // ignored entirely — see TRUST_PROXY_HOPS in env.validation.ts for why
  // that is the safe default rather than the convenient one.
  const trustProxyHops = config.get("TRUST_PROXY_HOPS", { infer: true });
  app.getHttpAdapter().getInstance().set("trust proxy", trustProxyHops);

  app.use(helmet());
  app.use(cookieParser());
  // Before routing, so no handler ever sees a NUL-bearing path.
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
