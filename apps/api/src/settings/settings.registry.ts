/**
 * The closed set of settings a super admin may edit at runtime.
 *
 * A registry rather than a free-form key/value store, because this table
 * holds payment credentials: an endpoint that writes arbitrary keys is an
 * endpoint that can be pointed at anything the application later reads. Every
 * writable key is listed here, typed, and marked secret or not.
 */

export type SettingType = "string" | "number" | "email" | "boolean";

export interface SettingDefinition {
  key: string;
  group: SettingGroup;
  label: string;
  /** Shown under the field in the admin UI. */
  help?: string;
  type: SettingType;
  /** Encrypted at rest and never returned to a client. */
  secret?: boolean;
  placeholder?: string;
}

export type SettingGroup = "payments" | "email" | "store";

export const SETTING_GROUPS: { id: SettingGroup; label: string; description: string }[] = [
  {
    id: "payments",
    label: "Payments",
    description:
      "Provider credentials. A provider stays disabled until its keys are set — the storefront hides a pay button it cannot honour rather than failing at checkout.",
  },
  {
    id: "email",
    label: "Email (SMTP)",
    description:
      "Outgoing mail for verification links, password resets and receipts. Until a host is set, mail is written to the server log instead of sent.",
  },
  {
    id: "store",
    label: "Store",
    description: "Details shown to customers across the storefront.",
  },
];

export const SETTING_DEFINITIONS: SettingDefinition[] = [
  // --- Payments -------------------------------------------------------------
  {
    key: "STRIPE_SECRET_KEY",
    group: "payments",
    label: "Stripe secret key",
    help: "Starts with sk_test_ or sk_live_.",
    type: "string",
    secret: true,
    placeholder: "sk_test_…",
  },
  {
    key: "STRIPE_WEBHOOK_SECRET",
    group: "payments",
    label: "Stripe webhook signing secret",
    help: "From the Stripe dashboard's webhook endpoint. Distinct from the secret key — webhooks are rejected without it.",
    type: "string",
    secret: true,
    placeholder: "whsec_…",
  },
  {
    key: "PAYSTACK_SECRET_KEY",
    group: "payments",
    label: "Paystack secret key",
    help: "Paystack signs webhooks with this same key; there is no separate webhook secret.",
    type: "string",
    secret: true,
    placeholder: "sk_test_…",
  },
  // --- Email ----------------------------------------------------------------
  { key: "SMTP_HOST", group: "email", label: "SMTP host", type: "string", placeholder: "smtp.example.com" },
  {
    key: "SMTP_PORT",
    group: "email",
    label: "SMTP port",
    help: "465 uses implicit TLS; anything else is treated as STARTTLS.",
    type: "number",
    placeholder: "587",
  },
  { key: "SMTP_USER", group: "email", label: "SMTP username", type: "string" },
  { key: "SMTP_PASSWORD", group: "email", label: "SMTP password", type: "string", secret: true },
  {
    key: "SMTP_FROM",
    group: "email",
    label: "From address",
    help: 'For example: Wisdom Shop <no-reply@yourdomain.com>',
    type: "string",
  },
  // --- Store ----------------------------------------------------------------
  { key: "STORE_NAME", group: "store", label: "Store name", type: "string", placeholder: "Wisdom Shop" },
  { key: "STORE_SUPPORT_EMAIL", group: "store", label: "Support email", type: "email" },
  { key: "STORE_SUPPORT_PHONE", group: "store", label: "Support phone", type: "string" },
];

const BY_KEY = new Map(SETTING_DEFINITIONS.map((d) => [d.key, d]));

export function findSetting(key: string): SettingDefinition | undefined {
  return BY_KEY.get(key);
}

export function isSecretKey(key: string): boolean {
  return findSetting(key)?.secret === true;
}

/**
 * Masks a secret for display: enough to recognise which key is installed,
 * never enough to use it. Short values reveal nothing at all rather than
 * most of themselves.
 */
export function maskSecret(value: string): string {
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 3)}••••${value.slice(-4)}`;
}
