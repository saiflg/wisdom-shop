import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Taking a fee payment through a school's own payment gateway.
 *
 * Pure and free of Nest so the parts that decide whether money moved can be
 * tested exhaustively without a network, a database, or anybody's live keys.
 * The only impure step is the HTTP call that starts a checkout; everything
 * that interprets what came back lives here.
 *
 * The rule the whole file serves: **a webhook is an assertion by a stranger
 * until its signature is checked**, and a verified webhook may still arrive
 * twice. Neither of those is allowed to result in a family being credited
 * wrongly — in either direction.
 */

export type FeeProvider = "PAYSTACK" | "FLUTTERWAVE" | "STRIPE";

export interface CheckoutRequest {
  url: string;
  method: "POST";
  headers: Record<string, string>;
  body: string;
}

export interface CheckoutInput {
  provider: FeeProvider;
  secretKey: string;
  /** Minor units, always — the same integers the invoice is stored in. */
  amountCents: number;
  currency: string;
  /** Where the family lands afterwards. */
  callbackUrl: string;
  /** Our own reference, which comes back on the webhook. */
  reference: string;
  payerEmail: string;
  invoiceNumber: string;
}

/**
 * Our reference for a payment attempt.
 *
 * Carries the invoice id so a webhook can find its way home without a
 * lookup table, and a random tail so a family retrying after abandoning a
 * checkout does not collide with their own earlier attempt. Kept to
 * characters every provider tolerates in a reference field.
 */
export function buildReference(invoiceId: string, nonce: string): string {
  return `wc-${invoiceId}-${nonce}`.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 100);
}

export function invoiceIdFromReference(reference: string): string | null {
  const match = /^wc-([a-z0-9]+)-/i.exec(reference);
  return match?.[1] ?? null;
}

/**
 * Builds the request that starts a checkout.
 *
 * Returned as data rather than being sent here, for the same reason the AI
 * provider registry does it: the shape of the request is the part worth
 * testing, and a test that has to intercept `fetch` to check a header is
 * testing the wrong thing.
 */
export function buildCheckoutRequest(input: CheckoutInput): CheckoutRequest {
  const json = (body: unknown) => JSON.stringify(body);
  const bearer = { Authorization: `Bearer ${input.secretKey}`, "Content-Type": "application/json" };

  switch (input.provider) {
    case "PAYSTACK":
      return {
        url: "https://api.paystack.co/transaction/initialize",
        method: "POST",
        headers: bearer,
        body: json({
          email: input.payerEmail,
          // Paystack takes the smallest unit, which is what we store.
          amount: input.amountCents,
          currency: input.currency,
          reference: input.reference,
          callback_url: input.callbackUrl,
          metadata: { invoiceNumber: input.invoiceNumber },
        }),
      };

    case "FLUTTERWAVE":
      return {
        url: "https://api.flutterwave.com/v3/payments",
        method: "POST",
        headers: bearer,
        body: json({
          tx_ref: input.reference,
          // Flutterwave takes major units, unlike the other two. Getting this
          // wrong bills a family one hundred times the fee, so it is
          // converted in exactly one place and there is a test for it.
          amount: (input.amountCents / 100).toFixed(2),
          currency: input.currency,
          redirect_url: input.callbackUrl,
          customer: { email: input.payerEmail },
          meta: { invoiceNumber: input.invoiceNumber },
        }),
      };

    case "STRIPE":
      return {
        url: "https://api.stripe.com/v1/checkout/sessions",
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.secretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        // Stripe's API is form-encoded, not JSON.
        body: new URLSearchParams({
          mode: "payment",
          success_url: input.callbackUrl,
          cancel_url: input.callbackUrl,
          client_reference_id: input.reference,
          "line_items[0][quantity]": "1",
          "line_items[0][price_data][currency]": input.currency.toLowerCase(),
          "line_items[0][price_data][unit_amount]": String(input.amountCents),
          "line_items[0][price_data][product_data][name]": `School fees ${input.invoiceNumber}`,
          customer_email: input.payerEmail,
        }).toString(),
      };
  }
}

/** Where the family should be sent, from whatever shape the provider replied with. */
export function checkoutUrlFrom(provider: FeeProvider, payload: unknown): string | null {
  const body = (payload ?? {}) as Record<string, unknown>;

  switch (provider) {
    case "PAYSTACK": {
      const data = body.data as { authorization_url?: unknown } | undefined;
      return typeof data?.authorization_url === "string" ? data.authorization_url : null;
    }
    case "FLUTTERWAVE": {
      const data = body.data as { link?: unknown } | undefined;
      return typeof data?.link === "string" ? data.link : null;
    }
    case "STRIPE":
      return typeof body.url === "string" ? body.url : null;
  }
}

/**
 * Constant-time signature check.
 *
 * `timingSafeEqual` throws on a length mismatch, which is itself a signal, so
 * the lengths are compared first and the whole thing fails closed on anything
 * unexpected. A thrown error here must never be mistaken for a pass.
 */
export function signatureMatches(expectedHex: string, providedHeader: string): boolean {
  try {
    const expected = Buffer.from(expectedHex, "utf8");
    const provided = Buffer.from(providedHeader.trim(), "utf8");
    if (expected.length !== provided.length) return false;
    return timingSafeEqual(expected, provided);
  } catch {
    return false;
  }
}

/**
 * Verifies a webhook against the school's own webhook secret.
 *
 * Every provider signs differently, and only Paystack and Flutterwave are
 * implemented — Stripe's scheme needs its timestamp-tolerance handling and is
 * refused rather than half-checked. A signature check that is nearly right is
 * worse than an honest "not supported": it looks like security.
 */
export function verifyWebhook(input: {
  provider: FeeProvider;
  rawBody: Buffer;
  signatureHeader: string | undefined;
  webhookSecret: string;
}): { ok: true } | { ok: false; reason: string } {
  if (!input.signatureHeader) return { ok: false, reason: "No signature header" };
  if (!input.webhookSecret) return { ok: false, reason: "No webhook secret configured for this school" };

  switch (input.provider) {
    case "PAYSTACK": {
      const expected = createHmac("sha512", input.webhookSecret).update(input.rawBody).digest("hex");
      return signatureMatches(expected, input.signatureHeader)
        ? { ok: true }
        : { ok: false, reason: "Signature mismatch" };
    }
    case "FLUTTERWAVE": {
      // Flutterwave sends the secret hash itself rather than an HMAC.
      return signatureMatches(input.webhookSecret, input.signatureHeader)
        ? { ok: true }
        : { ok: false, reason: "Signature mismatch" };
    }
    case "STRIPE":
      return { ok: false, reason: "Stripe webhooks are not supported for school fees yet" };
  }
}

export interface PaymentEvent {
  /** Our reference, which is how the payment finds its invoice. */
  reference: string;
  /** Minor units, whatever the provider's wire format used. */
  amountCents: number;
  currency: string | null;
  succeeded: boolean;
  /** The provider's own id for the event, for idempotency. */
  eventId: string;
}

/**
 * Reads a verified webhook body.
 *
 * Returns null rather than throwing for anything unrecognised: providers send
 * event types we do not care about, and a 500 on a charge.dispute.created
 * would have the provider retrying it forever.
 */
export function parsePaymentEvent(provider: FeeProvider, body: unknown): PaymentEvent | null {
  const payload = (body ?? {}) as Record<string, unknown>;

  if (provider === "PAYSTACK") {
    if (payload.event !== "charge.success") return null;
    const data = payload.data as Record<string, unknown> | undefined;
    const reference = typeof data?.reference === "string" ? data.reference : null;
    const amount = typeof data?.amount === "number" ? data.amount : null;
    if (!reference || amount === null) return null;
    return {
      reference,
      amountCents: amount,
      currency: typeof data?.currency === "string" ? data.currency : null,
      succeeded: data?.status === "success",
      // Paystack carries no unique event id, so the reference is the key —
      // the same choice the shop's webhook handler makes, for the same
      // reason.
      eventId: `paystack:${reference}`,
    };
  }

  if (provider === "FLUTTERWAVE") {
    const data = payload.data as Record<string, unknown> | undefined;
    const reference = typeof data?.tx_ref === "string" ? data.tx_ref : null;
    const amount = typeof data?.amount === "number" ? data.amount : null;
    if (!reference || amount === null) return null;
    return {
      reference,
      // Flutterwave reports major units. Rounded, not truncated: 1.005 is a
      // rounding artefact, and losing a kobo per payment is a reconciliation
      // problem somebody eventually has to chase.
      amountCents: Math.round(amount * 100),
      currency: typeof data?.currency === "string" ? data.currency : null,
      succeeded: data?.status === "successful",
      eventId:
        typeof data?.id === "number" || typeof data?.id === "string"
          ? `flutterwave:${data.id}`
          : `flutterwave:${reference}`,
    };
  }

  return null;
}

/**
 * What to record for a verified, successful payment.
 *
 * Deliberately refuses to credit more than the invoice is worth. A gateway
 * reporting a larger amount than we asked for means something is wrong —
 * a tampered request, a currency mix-up, a duplicated line — and silently
 * accepting it turns a bug into a refund nobody noticed was needed.
 */
export function amountToCredit(input: {
  eventAmountCents: number;
  invoiceOutstandingCents: number;
}): { credit: number } | { refuse: string } {
  if (input.eventAmountCents <= 0) return { refuse: "The gateway reported a payment of nothing" };
  if (input.eventAmountCents > input.invoiceOutstandingCents) {
    return {
      refuse: `The gateway reported ${input.eventAmountCents} against an outstanding balance of ${input.invoiceOutstandingCents}`,
    };
  }
  return { credit: input.eventAmountCents };
}
