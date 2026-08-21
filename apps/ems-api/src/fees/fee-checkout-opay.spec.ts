import { createHmac } from "node:crypto";
import {
  buildCheckoutRequest,
  checkoutUrlFrom,
  parsePaymentEvent,
  verifyWebhook,
  FEE_PROVIDERS,
  PROVIDER_LABELS,
} from "./fee-checkout";

const base = {
  provider: "OPAY" as const,
  secretKey: "pk_test_public",
  amountCents: 22_000_00,
  currency: "NGN",
  callbackUrl: "https://school.example/fees/done",
  reference: "wc-inv123-abcdef",
  payerEmail: "parent@example.com",
  invoiceNumber: "FEE-000010",
  merchantId: "281822",
};

describe("OPay checkout request", () => {
  it("posts to the live cashier by default and the sandbox when asked", () => {
    expect(buildCheckoutRequest(base).url).toBe("https://liveapi.opaycheckout.com/api/v1/international/cashier/create");
    expect(buildCheckoutRequest({ ...base, sandbox: true }).url).toBe(
      "https://testapi.opaycheckout.com/api/v1/international/cashier/create",
    );
  });

  it("identifies the merchant in a header, which no other provider needs", () => {
    expect(buildCheckoutRequest(base).headers.MerchantId).toBe("281822");
  });

  // The bug worth guarding: Flutterwave takes major units and the rest take
  // minor. Getting OPay wrong in either direction bills a parent 100x the
  // fee or a hundredth of it.
  it("sends the exact minor units the invoice is stored in", () => {
    const body = JSON.parse(buildCheckoutRequest(base).body);
    expect(body.amount.total).toBe("2200000");
    expect(body.amount.currency).toBe("NGN");
  });

  it("carries our own reference so the webhook can find the invoice", () => {
    const body = JSON.parse(buildCheckoutRequest(base).body);
    expect(body.reference).toBe("wc-inv123-abcdef");
  });
});

describe("OPay checkout response", () => {
  it("returns the cashier url on success", () => {
    expect(checkoutUrlFrom("OPAY", { code: "00000", data: { cashierUrl: "https://cashier.opay/x" } })).toBe(
      "https://cashier.opay/x",
    );
  });

  // OPay answers HTTP 200 even for failures, with the outcome in `code`.
  it("refuses to redirect when OPay reports a failure in a 200 response", () => {
    expect(checkoutUrlFrom("OPAY", { code: "02000", message: "Authentication failed" })).toBeNull();
  });

  it("returns null rather than a broken redirect when the url is missing", () => {
    expect(checkoutUrlFrom("OPAY", { code: "00000", data: {} })).toBeNull();
    expect(checkoutUrlFrom("OPAY", {})).toBeNull();
  });
});

describe("OPay webhook verification", () => {
  const secret = "sk_live_secret";
  const rawBody = Buffer.from(JSON.stringify({ payload: { reference: "wc-inv123-abc", amount: "100000" } }));
  const good = createHmac("sha3-512", secret).update(rawBody).digest("hex");

  it("accepts a correct SHA3-512 signature", () => {
    expect(verifyWebhook({ provider: "OPAY", rawBody, signatureHeader: good, webhookSecret: secret })).toEqual({
      ok: true,
    });
  });

  it("rejects a SHA-512 signature, which is a different algorithm", () => {
    const wrongAlgorithm = createHmac("sha512", secret).update(rawBody).digest("hex");
    expect(verifyWebhook({ provider: "OPAY", rawBody, signatureHeader: wrongAlgorithm, webhookSecret: secret }).ok).toBe(
      false,
    );
  });

  it("rejects a signature made with a different secret", () => {
    const other = createHmac("sha3-512", "sk_live_other").update(rawBody).digest("hex");
    expect(verifyWebhook({ provider: "OPAY", rawBody, signatureHeader: other, webhookSecret: secret }).ok).toBe(false);
  });

  it("fails closed with no header and with no secret", () => {
    expect(verifyWebhook({ provider: "OPAY", rawBody, signatureHeader: undefined, webhookSecret: secret }).ok).toBe(
      false,
    );
    expect(verifyWebhook({ provider: "OPAY", rawBody, signatureHeader: good, webhookSecret: "" }).ok).toBe(false);
  });

  it("rejects a body altered after signing", () => {
    const tampered = Buffer.from(JSON.stringify({ payload: { reference: "wc-inv123-abc", amount: "999999" } }));
    expect(verifyWebhook({ provider: "OPAY", rawBody: tampered, signatureHeader: good, webhookSecret: secret }).ok).toBe(
      false,
    );
  });
});

describe("OPay payment events", () => {
  it("reads a successful payment", () => {
    const event = parsePaymentEvent("OPAY", {
      payload: { reference: "wc-inv1-a", amount: "2200000", currency: "NGN", status: "SUCCESS", transactionId: "T99" },
    });
    expect(event).toEqual({
      reference: "wc-inv1-a",
      amountCents: 2_200_000,
      currency: "NGN",
      succeeded: true,
      eventId: "opay:T99",
    });
  });

  it("marks a failed payment as not succeeded rather than dropping it", () => {
    const event = parsePaymentEvent("OPAY", {
      payload: { reference: "wc-inv1-a", amount: "2200000", status: "FAILED", transactionId: "T98" },
    });
    expect(event?.succeeded).toBe(false);
  });

  // Number("") is 0, which would read as a real payment of nothing rather
  // than as a malformed event.
  it("ignores an event whose amount is empty or not a number", () => {
    expect(parsePaymentEvent("OPAY", { payload: { reference: "wc-1-a", amount: "" } })).toBeNull();
    expect(parsePaymentEvent("OPAY", { payload: { reference: "wc-1-a", amount: "abc" } })).toBeNull();
  });

  it("ignores an event with no reference, which could not find an invoice anyway", () => {
    expect(parsePaymentEvent("OPAY", { payload: { amount: "1000", status: "SUCCESS" } })).toBeNull();
  });

  it("falls back through transactionId, orderNo and reference for idempotency", () => {
    const byOrder = parsePaymentEvent("OPAY", { payload: { reference: "wc-1-a", amount: "100", orderNo: "O7" } });
    expect(byOrder?.eventId).toBe("opay:O7");
    const byReference = parsePaymentEvent("OPAY", { payload: { reference: "wc-1-a", amount: "100" } });
    expect(byReference?.eventId).toBe("opay:wc-1-a");
  });
});

describe("the provider list", () => {
  it("includes OPay and names every provider it lists", () => {
    expect(FEE_PROVIDERS).toContain("OPAY");
    for (const provider of FEE_PROVIDERS) {
      expect(PROVIDER_LABELS[provider]).toBeTruthy();
    }
  });

  it("has a label for every provider, so the chooser can never show a blank option", () => {
    expect(Object.keys(PROVIDER_LABELS).sort()).toEqual([...FEE_PROVIDERS].sort());
  });
});
