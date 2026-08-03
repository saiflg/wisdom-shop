import { z } from "zod";

/**
 * An empty-string env var (as `.env.example`'s placeholder
 * `GEMINI_API_KEY=` would be, once copied to `.env`) means "not set", not
 * "set to the empty string" — same helper as the shop's own
 * env.validation.ts, for the same reason.
 */
const optionalSecret = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().optional(),
);

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4001),
  APP_URL: z.string().url().default("http://localhost:3001"),

  // Control-plane database: the School registry and platform operators.
  CONTROL_DATABASE_URL: z.string().min(1, "CONTROL_DATABASE_URL is required"),
  // Admin credentials with CREATEDB, used ONLY by ProvisioningService to run
  // `CREATE DATABASE` for a new school — never used for ordinary queries.
  POSTGRES_ADMIN_URL: z.string().min(1, "POSTGRES_ADMIN_URL is required"),
  // Building block for per-school connection strings — see
  // tenancy/connection-string.ts. Same Postgres server as the control DB and
  // the shop's own, just more databases on it (see PROGRESS.md).
  TENANT_DB_HOST: z.string().min(1).default("localhost"),
  TENANT_DB_PORT: z.coerce.number().int().positive().default(5432),
  TENANT_DB_USER: z.string().min(1).default("wisdom"),
  TENANT_DB_PASSWORD: z.string().min(1).default("wisdom"),

  // School-user JWTs. Deliberately NOT named JWT_ACCESS_SECRET/
  // JWT_REFRESH_SECRET: this whole monorepo's dev .env is one shared file
  // loaded into every service via env_file, so reusing the shop's own key
  // names would hand both apps the identical secret — a token from one
  // would then be structurally valid on the other.
  EMS_JWT_ACCESS_SECRET: z.string().min(32, "EMS_JWT_ACCESS_SECRET must be at least 32 characters"),
  EMS_JWT_REFRESH_SECRET: z.string().min(32, "EMS_JWT_REFRESH_SECRET must be at least 32 characters"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),

  // Encrypts per-school gateway credentials (SMTP passwords, provider API
  // secrets) at rest. Rotating it makes every stored secret undecryptable —
  // settings pages then report the gateway as unconfigured and admins must
  // re-enter it, which is why decryption failure is handled rather than
  // thrown (see TenantSecretsService.tryDecrypt).
  EMS_SETTINGS_ENCRYPTION_KEY: z
    .string()
    .min(32, "EMS_SETTINGS_ENCRYPTION_KEY must be at least 32 characters"),

  // Platform-operator JWTs.
  PLATFORM_JWT_ACCESS_SECRET: z
    .string()
    .min(32, "PLATFORM_JWT_ACCESS_SECRET must be at least 32 characters"),
  PLATFORM_JWT_REFRESH_SECRET: z
    .string()
    .min(32, "PLATFORM_JWT_REFRESH_SECRET must be at least 32 characters"),
  PLATFORM_JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  PLATFORM_JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),

  COOKIE_DOMAIN: z.string().optional(),

  SEED_PLATFORM_ADMIN_EMAIL: z.string().email().optional(),
  SEED_PLATFORM_ADMIN_PASSWORD: z.string().min(12).optional(),

  // The one deliberate exception to "every cross-app secret must be
  // distinct" (see JWT secrets above): this value must be IDENTICAL to the
  // shop's own EDU_SETUP_SIGNING_SECRET, since verifying a token the shop
  // minted requires computing the same HMAC it did. See onboarding/
  // edu-handoff-token.ts.
  EDU_SETUP_SIGNING_SECRET: z
    .string()
    .min(32, "EDU_SETUP_SIGNING_SECRET must be at least 32 characters"),

  // Number of reverse proxies in front of the API — see the shop's own
  // env.validation.ts for why this defaults to 0 rather than trusting
  // X-Forwarded-For with nothing in front to set it.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),

  RATE_LIMIT_TTL_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_LIMIT: z.coerce.number().int().positive().default(100),

  SWAGGER_ENABLED: z
    .preprocess((value) => value === "true" || value === true, z.boolean())
    .default(false),

  // AI curriculum generation (Gemini). Optional so the app boots and every
  // other feature works without it — generation returns 503 until this is
  // set, same as the shop's payment providers. Model name is configurable
  // since the Gemini 2.x/3.x lineup is still shifting; see ai/gemini.service.ts.
  GEMINI_API_KEY: optionalSecret,
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
