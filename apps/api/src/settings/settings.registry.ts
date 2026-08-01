/**
 * The closed set of settings a super admin may edit at runtime.
 *
 * A registry rather than a free-form key/value store, because this table
 * holds payment credentials: an endpoint that writes arbitrary keys is an
 * endpoint that can be pointed at anything the application later reads. Every
 * writable key is listed here, typed, and marked secret or not.
 */

export type SettingType = "string" | "number" | "email" | "boolean" | "url";

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

export type SettingGroup = "payments" | "email" | "store" | "social";

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
  {
    id: "social",
    label: "Social media",
    description:
      "Shown as icons in the storefront footer. These are public URLs, not credentials — leave a platform blank to hide its icon rather than showing a dead link.",
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
  {
    key: "FLUTTERWAVE_SECRET_KEY",
    group: "payments",
    label: "Flutterwave secret key",
    help: "Starts with FLWSECK.",
    type: "string",
    secret: true,
    placeholder: "FLWSECK_TEST-…",
  },
  {
    key: "FLUTTERWAVE_WEBHOOK_HASH",
    group: "payments",
    label: "Flutterwave webhook hash",
    help: "The secret hash you set in the Flutterwave dashboard. Flutterwave sends it verbatim in verif-hash — it is a shared secret, not a signature over the body.",
    type: "string",
    secret: true,
  },
  {
    key: "PAYPAL_CLIENT_ID",
    group: "payments",
    label: "PayPal client ID",
    type: "string",
    secret: true,
  },
  {
    key: "PAYPAL_CLIENT_SECRET",
    group: "payments",
    label: "PayPal client secret",
    type: "string",
    secret: true,
  },
  {
    key: "PAYPAL_WEBHOOK_ID",
    group: "payments",
    label: "PayPal webhook ID",
    help: "From the webhook you created in the PayPal dashboard. Webhooks are rejected without it.",
    type: "string",
    secret: true,
  },
  {
    key: "PAYPAL_ENV",
    group: "payments",
    label: "PayPal environment",
    help: 'Either "sandbox" or "live". Anything else is treated as sandbox, so a typo cannot take real money.',
    type: "string",
    placeholder: "sandbox",
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
  // --- Social media -----------------------------------------------------------
  {
    key: "SOCIAL_FACEBOOK_URL",
    group: "social",
    label: "Facebook",
    type: "url",
    placeholder: "https://facebook.com/yourpage",
  },
  {
    key: "SOCIAL_INSTAGRAM_URL",
    group: "social",
    label: "Instagram",
    type: "url",
    placeholder: "https://instagram.com/yourhandle",
  },
  {
    key: "SOCIAL_X_URL",
    group: "social",
    label: "X (Twitter)",
    type: "url",
    placeholder: "https://x.com/yourhandle",
  },
  {
    key: "SOCIAL_YOUTUBE_URL",
    group: "social",
    label: "YouTube",
    type: "url",
    placeholder: "https://youtube.com/@yourchannel",
  },
  {
    key: "SOCIAL_LINKEDIN_URL",
    group: "social",
    label: "LinkedIn",
    type: "url",
    placeholder: "https://linkedin.com/company/yourcompany",
  },
  {
    key: "SOCIAL_TIKTOK_URL",
    group: "social",
    label: "TikTok",
    type: "url",
    placeholder: "https://tiktok.com/@yourhandle",
  },
  {
    key: "SOCIAL_WHATSAPP_URL",
    group: "social",
    label: "WhatsApp",
    help: "Full wa.me link, e.g. https://wa.me/15551234567",
    type: "url",
    placeholder: "https://wa.me/15551234567",
  },
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
