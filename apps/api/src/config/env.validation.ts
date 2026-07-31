import { z } from "zod";

/**
 * An optional secret that treats an empty string as "not set".
 *
 * `.env.example` ships empty placeholders (`STRIPE_SECRET_KEY=`), and copying
 * it to `.env` therefore defines the key with an empty value. Without this,
 * `""` is a valid string and code that checks `if (!key)` behaves correctly
 * but code that checks `if (key !== undefined)` does not — so normalise it
 * once, here, rather than defending at every use site.
 */
const optionalSecret = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().optional(),
);

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
  COOKIE_DOMAIN: z.string().optional(),
  TWO_FACTOR_APP_NAME: z.string().default("Wisdom Shop"),
  TWO_FACTOR_ENCRYPTION_KEY: z
    .string()
    .min(32, "TWO_FACTOR_ENCRYPTION_KEY must be at least 32 characters")
    .default("changeme_2fa_encryption_key_min_32_chars__"),
  SEED_SUPER_ADMIN_EMAIL: z.string().email().optional(),
  SEED_SUPER_ADMIN_PASSWORD: z.string().min(12).optional(),
  EDU_SETUP_REDIRECT_URL: z
    .string()
    .url()
    .default("https://setup.wisdomshop.example/onboarding"),
  EDU_SETUP_SIGNING_SECRET: z
    .string()
    .min(32, "EDU_SETUP_SIGNING_SECRET must be at least 32 characters")
    .default("changeme_edu_setup_secret_min_32_chars___"),
  // Order pricing policy. Both default to 0 so no charge is ever applied
  // that wasn't configured deliberately. See src/orders/pricing.ts.
  SHIPPING_FLAT_CENTS: z.coerce.number().int().min(0).default(0),
  TAX_PERCENT: z.coerce.number().min(0).max(100).default(0),
  // How long after a refresh token is rotated a replay of it is treated as a
  // browser-tab race rather than theft. See src/auth/refresh-race.ts for the
  // three conditions that must all hold; this only bounds the first.
  //
  // Set to 0 to restore strict detection, at the cost of signing users out
  // when they open two tabs at once.
  REFRESH_REUSE_GRACE_MS: z.coerce.number().int().min(0).max(120_000).default(15_000),
  // Number of reverse proxies in front of the API. 0 means do not trust
  // X-Forwarded-For at all.
  //
  // This defaults to 0 on purpose. Trusting the header when nothing sets it
  // lets any client claim any IP, which turns the rate limiter into
  // decoration — an attacker simply sends a new X-Forwarded-For per request.
  // Set it to the real hop count (1 behind the bundled nginx) only once a
  // proxy is genuinely in front, and see docs/DEPLOYMENT.md.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  // Serves /docs in production too. Off by default: the schema describes
  // every route, DTO and auth requirement, which no real client needs.
  SWAGGER_ENABLED: z
    .preprocess((value) => value === "true" || value === true, z.boolean())
    .default(false),
  // Rate limiting. The global bucket covers ordinary traffic; the strict one
  // applies only to routes marked @StrictRateLimit() — sign-in, registration
  // and password reset — where an attacker's request volume is the attack.
  // Tunable because the right numbers depend on whether the API sits behind a
  // shared NAT, a CDN, or neither.
  RATE_LIMIT_TTL_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_LIMIT: z.coerce.number().int().positive().default(100),
  AUTH_RATE_LIMIT_TTL_MS: z.coerce.number().int().positive().default(900_000),
  AUTH_RATE_LIMIT_LIMIT: z.coerce.number().int().positive().default(20),
  // Payment provider credentials. Optional so the app boots and every other
  // feature works without them; payment initiation returns 503 and webhook
  // verification refuses until the project owner sets them.
  STRIPE_SECRET_KEY: optionalSecret,
  STRIPE_WEBHOOK_SECRET: optionalSecret,
  // Paystack signs webhooks with the secret key itself — there is no
  // separate webhook secret.
  PAYSTACK_SECRET_KEY: optionalSecret,
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
