import { createHmac } from "node:crypto";
import {
  amountToCredit,
  buildCheckoutRequest,
  buildReference,
  checkoutUrlFrom,
  invoiceIdFromReference,
  parsePaymentEvent,
  signatureMatches,
  verifyWebhook,
} from "./fee-checkout";

const SECRET = "sk_test_school_secret";

describe("buildReference", () => {
  it("round-trips the invoice id", () => {
    const reference = buildReference("clx123abc", "a1b2c3");
    expect(invoiceIdFromReference(reference)).toBe("clx123abc");
  });

  it("gives a different reference each attempt", () => {
    // A family who abandons a checkout and starts again must not collide
    // with their own earlier attempt — the unique index would reject the
    // second payment as a duplicate webhook.
    expect(buildReference("clx123abc", "one")).not.toBe(buildReference("clx123abc", "two"));
  });

  it("strips anything a provider might refuse in a reference field", () => {
    expect(buildReference("clx/123 abc", "n#1")).toMatch(/^[a-zA-Z0-9-]+$/);
  });

  it("returns null for a reference that is not ours", () => {
    expect(invoiceIdFromReference("some-other-system-ref")).toBeNull();
    expect(invoiceIdFromReference("")).toBeNull();
  });
});

describe("buildCheckoutRequest", () => {
  const base = {
    secretKey: SECRET,
    amountCents: 5000_00,
    currency: "NGN",
    callbackUrl: "https://school.example/fees",
    reference: "wc-inv1-abc",
    payerEmail: "parent@example.com",
    invoiceNumber: "INV-000042",
  } as const;

  it("sends Paystack the amount in minor units, unchanged", () => {
    const request = buildCheckoutRequest({ ...base, provider: "PAYSTACK" });
    expect(JSON.parse(request.body).amount).toBe(500000);
    expect(request.headers.Authorization).toBe(`Bearer ${SECRET}`);
  });

  it("sends Flutterwave MAJOR units, because it is the one that differs", () => {
    // Getting this wrong bills a family one hundred times the fee.
    const request = buildCheckoutRequest({ ...base, provider: "FLUTTERWAVE" });
    expect(JSON.parse(request.body).amount).toBe("5000.00");
  });

  it("sends Stripe minor units, form-encoded", () => {
    const request = buildCheckoutRequest({ ...base, provider: "STRIPE" });
    expect(request.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    const form = new URLSearchParams(request.body);
    expect(form.get("line_items[0][price_data][unit_amount]")).toBe("500000");
    expect(form.get("client_reference_id")).toBe("wc-inv1-abc");
  });

  it("never puts the secret key anywhere but the Authorization header", () => {
    for (const provider of ["PAYSTACK", "FLUTTERWAVE", "STRIPE"] as const) {
      const request = buildCheckoutRequest({ ...base, provider });
      expect(request.body).not.toContain(SECRET);
      expect(request.url).not.toContain(SECRET);
    }
  });

  it("carries our reference to every provider, since it is how the money comes home", () => {
    expect(buildCheckoutRequest({ ...base, provider: "PAYSTACK" }).body).toContain("wc-inv1-abc");
    expect(buildCheckoutRequest({ ...base, provider: "FLUTTERWAVE" }).body).toContain("wc-inv1-abc");
    expect(buildCheckoutRequest({ ...base, provider: "STRIPE" }).body).toContain("wc-inv1-abc");
  });
});

describe("checkoutUrlFrom", () => {
  it("finds the redirect in each provider's shape", () => {
    expect(checkoutUrlFrom("PAYSTACK", { data: { authorization_url: "https://pay/1" } })).toBe("https://pay/1");
    expect(checkoutUrlFrom("FLUTTERWAVE", { data: { link: "https://pay/2" } })).toBe("https://pay/2");
    expect(checkoutUrlFrom("STRIPE", { url: "https://pay/3" })).toBe("https://pay/3");
  });

  it("returns null rather than guessing when the shape is wrong", () => {
    expect(checkoutUrlFrom("PAYSTACK", {})).toBeNull();
    expect(checkoutUrlFrom("PAYSTACK", { data: { authorization_url: 42 } })).toBeNull();
    expect(checkoutUrlFrom("STRIPE", null)).toBeNull();
  });
});

describe("verifyWebhook", () => {
  const body = Buffer.from(JSON.stringify({ event: "charge.success" }));

  it("accepts a correctly signed Paystack webhook", () => {
    const signature = createHmac("sha512", SECRET).update(body).digest("hex");
    expect(verifyWebhook({ provider: "PAYSTACK", rawBody: body, signatureHeader: signature, webhookSecret: SECRET }))
      .toEqual({ ok: true });
  });

  it("REFUSES one signed with the wrong secret", () => {
    const signature = createHmac("sha512", "someone-elses-secret").update(body).digest("hex");
    const result = verifyWebhook({
      provider: "PAYSTACK",
      rawBody: body,
      signatureHeader: signature,
      webhookSecret: SECRET,
    });
    expect(result).toEqual({ ok: false, reason: "Signature mismatch" });
  });

  it("REFUSES one where the body was changed after signing", () => {
    // The whole point: the signature covers the bytes, so an attacker who
    // edits the amount invalidates it.
    const signature = createHmac("sha512", SECRET).update(body).digest("hex");
    const tampered = Buffer.from(JSON.stringify({ event: "charge.success", data: { amount: 999999 } }));
    expect(
      verifyWebhook({ provider: "PAYSTACK", rawBody: tampered, signatureHeader: signature, webhookSecret: SECRET }),
    ).toEqual({ ok: false, reason: "Signature mismatch" });
  });

  it("refuses when there is no signature at all", () => {
    expect(
      verifyWebhook({ provider: "PAYSTACK", rawBody: body, signatureHeader: undefined, webhookSecret: SECRET }).ok,
    ).toBe(false);
  });

  it("refuses when the school has configured no webhook secret", () => {
    // Fails closed. An unconfigured school must not accept unsigned money.
    expect(
      verifyWebhook({ provider: "PAYSTACK", rawBody: body, signatureHeader: "anything", webhookSecret: "" }).ok,
    ).toBe(false);
  });

  it("checks Flutterwave's secret hash", () => {
    expect(
      verifyWebhook({ provider: "FLUTTERWAVE", rawBody: body, signatureHeader: SECRET, webhookSecret: SECRET }).ok,
    ).toBe(true);
    expect(
      verifyWebhook({ provider: "FLUTTERWAVE", rawBody: body, signatureHeader: "nope", webhookSecret: SECRET }).ok,
    ).toBe(false);
  });

  it("refuses Stripe outright rather than checking it badly", () => {
    // A signature check that is nearly right is worse than an honest
    // refusal: it looks like security.
    const result = verifyWebhook({
      provider: "STRIPE",
      rawBody: body,
      signatureHeader: "t=1,v1=abc",
      webhookSecret: SECRET,
    });
    expect(result.ok).toBe(false);
  });
});

describe("signatureMatches", () => {
  it("is false for different lengths rather than throwing", () => {
    // timingSafeEqual throws on a length mismatch, and a thrown error must
    // never be mistaken for a pass.
    expect(signatureMatches("abcdef", "abc")).toBe(false);
  });

  it("matches an identical string", () => {
    expect(signatureMatches("abcdef", "abcdef")).toBe(true);
  });

  it("tolerates surrounding whitespace in the header", () => {
    expect(signatureMatches("abcdef", "  abcdef  ")).toBe(true);
  });
});

describe("parsePaymentEvent", () => {
  it("reads a successful Paystack charge", () => {
    const event = parsePaymentEvent("PAYSTACK", {
      event: "charge.success",
      data: { reference: "wc-inv1-abc", amount: 500000, currency: "NGN", status: "success" },
    });
    expect(event).toEqual({
      reference: "wc-inv1-abc",
      amountCents: 500000,
      currency: "NGN",
      succeeded: true,
      eventId: "paystack:wc-inv1-abc",
    });
  });

  it("converts Flutterwave's major units back to minor ones", () => {
    const event = parsePaymentEvent("FLUTTERWAVE", {
      data: { tx_ref: "wc-inv1-abc", amount: 5000.5, currency: "NGN", status: "successful", id: 99 },
    });
    expect(event?.amountCents).toBe(500050);
    expect(event?.eventId).toBe("flutterwave:99");
  });

  it("rounds rather than truncates, so nobody loses a kobo a payment", () => {
    expect(parsePaymentEvent("FLUTTERWAVE", { data: { tx_ref: "r", amount: 10.005, status: "successful" } })?.amountCents)
      .toBe(1001);
  });

  it("ignores event types we do not handle instead of throwing", () => {
    // A 500 on a dispute event has the provider retrying it forever.
    expect(parsePaymentEvent("PAYSTACK", { event: "charge.dispute.create", data: {} })).toBeNull();
    expect(parsePaymentEvent("PAYSTACK", {})).toBeNull();
    expect(parsePaymentEvent("PAYSTACK", null)).toBeNull();
  });

  it("marks a failed charge as not succeeded rather than dropping it", () => {
    const event = parsePaymentEvent("PAYSTACK", {
      event: "charge.success",
      data: { reference: "r", amount: 100, status: "failed" },
    });
    expect(event?.succeeded).toBe(false);
  });

  it("returns null for Stripe, which is not wired up", () => {
    expect(parsePaymentEvent("STRIPE", { type: "checkout.session.completed" })).toBeNull();
  });
});

describe("amountToCredit", () => {
  it("credits what was paid", () => {
    expect(amountToCredit({ eventAmountCents: 500000, invoiceOutstandingCents: 500000 })).toEqual({ credit: 500000 });
  });

  it("credits a part payment", () => {
    expect(amountToCredit({ eventAmountCents: 200000, invoiceOutstandingCents: 500000 })).toEqual({ credit: 200000 });
  });

  it("REFUSES more than the invoice is worth", () => {
    // Something is wrong — a tampered request, a currency mix-up, a
    // duplicated line — and accepting it silently turns a bug into a refund
    // nobody noticed was needed.
    const result = amountToCredit({ eventAmountCents: 600000, invoiceOutstandingCents: 500000 });
    expect(result).toHaveProperty("refuse");
  });

  it("refuses a payment of nothing", () => {
    expect(amountToCredit({ eventAmountCents: 0, invoiceOutstandingCents: 500000 })).toHaveProperty("refuse");
    expect(amountToCredit({ eventAmountCents: -100, invoiceOutstandingCents: 500000 })).toHaveProperty("refuse");
  });

  it("refuses anything at all against a settled invoice", () => {
    expect(amountToCredit({ eventAmountCents: 100, invoiceOutstandingCents: 0 })).toHaveProperty("refuse");
  });
});
