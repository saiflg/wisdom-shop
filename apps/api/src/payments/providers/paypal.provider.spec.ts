import { ServiceUnavailableException } from "@nestjs/common";
import { PayPalProvider, type PayPalEvent } from "./paypal.provider";
import type { SettingsService } from "../../settings/settings.service";

/** The network is mocked throughout — see the warning on the provider. */
function buildSettings(values: Record<string, string | undefined>): SettingsService {
  return {
    get: jest.fn(async (key: string) => values[key]),
    isConfigured: jest.fn(async (key: string) => values[key] !== undefined),
  } as unknown as SettingsService;
}

const CREDENTIALS = {
  PAYPAL_CLIENT_ID: "client",
  PAYPAL_CLIENT_SECRET: "secret",
  PAYPAL_WEBHOOK_ID: "wh_1",
};

/** Queues responses in call order. */
function mockFetchSequence(responses: { ok: boolean; status?: number; body: unknown }[]) {
  const fn = jest.fn();
  for (const response of responses) {
    fn.mockResolvedValueOnce({
      ok: response.ok,
      status: response.status ?? (response.ok ? 200 : 500),
      json: async () => response.body,
    });
  }
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

const tokenResponse = { ok: true, body: { access_token: "tok", expires_in: 3600 } };

describe("PayPalProvider amount conversion", () => {
  it("formats minor units as the decimal string PayPal expects", () => {
    expect(PayPalProvider.toAmountValue(1999)).toBe("19.99");
    expect(PayPalProvider.toAmountValue(1050)).toBe("10.50");
    // Always two decimals — PayPal rejects "10.5" for some currencies.
    expect(PayPalProvider.toAmountValue(1000)).toBe("10.00");
  });

  it("parses an amount back to minor units", () => {
    expect(PayPalProvider.fromAmountValue("19.99")).toBe(1999);
    expect(PayPalProvider.fromAmountValue("10.50")).toBe(1050);
  });
});

describe("PayPalProvider.createOrder", () => {
  const input = {
    orderNumber: "WS-1",
    amountMinorUnits: 1999,
    currency: "USD",
    returnUrl: "https://shop.example/ok",
    cancelUrl: "https://shop.example/no",
  };

  it("refuses without credentials", async () => {
    const provider = new PayPalProvider(buildSettings({}));
    await expect(provider.createOrder(input)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("authenticates, then creates an order carrying the order number", async () => {
    const fetchMock = mockFetchSequence([
      tokenResponse,
      {
        ok: true,
        body: { id: "PP-1", links: [{ rel: "approve", href: "https://paypal/approve" }] },
      },
    ]);
    const provider = new PayPalProvider(buildSettings(CREDENTIALS));

    const result = await provider.createOrder(input);

    const body = JSON.parse((fetchMock.mock.calls[1] as never[])[1]["body"] as string);
    // custom_id is what comes back on the webhook, so the order can be found
    // without trusting anything the buyer controls.
    expect(body.purchase_units[0].custom_id).toBe("WS-1");
    expect(body.purchase_units[0].amount.value).toBe("19.99");
    expect(result).toEqual({ redirectUrl: "https://paypal/approve", reference: "PP-1" });
  });

  it("defaults to sandbox so a misconfiguration cannot take real money", async () => {
    const fetchMock = mockFetchSequence([
      tokenResponse,
      { ok: true, body: { id: "PP-1", links: [{ rel: "approve", href: "https://x" }] } },
    ]);
    const provider = new PayPalProvider(buildSettings(CREDENTIALS));

    await provider.createOrder(input);
    expect(fetchMock.mock.calls[0][0]).toContain("sandbox");
  });

  it("uses the live host only when explicitly asked", async () => {
    const fetchMock = mockFetchSequence([
      tokenResponse,
      { ok: true, body: { id: "PP-1", links: [{ rel: "approve", href: "https://x" }] } },
    ]);
    const provider = new PayPalProvider(buildSettings({ ...CREDENTIALS, PAYPAL_ENV: "live" }));

    await provider.createOrder(input);
    expect(fetchMock.mock.calls[0][0]).not.toContain("sandbox");
  });

  it("treats a typo in the environment as sandbox", async () => {
    const fetchMock = mockFetchSequence([
      tokenResponse,
      { ok: true, body: { id: "PP-1", links: [{ rel: "approve", href: "https://x" }] } },
    ]);
    const provider = new PayPalProvider(buildSettings({ ...CREDENTIALS, PAYPAL_ENV: "LIVE " }));

    await provider.createOrder(input);
    expect(fetchMock.mock.calls[0][0]).toContain("sandbox");
  });

  it("fails when the response carries no approve link", async () => {
    mockFetchSequence([tokenResponse, { ok: true, body: { id: "PP-1", links: [] } }]);
    const provider = new PayPalProvider(buildSettings(CREDENTIALS));

    await expect(provider.createOrder(input)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("reuses a cached token rather than minting one per request", async () => {
    const fetchMock = mockFetchSequence([
      tokenResponse,
      { ok: true, body: { id: "PP-1", links: [{ rel: "approve", href: "https://x" }] } },
      { ok: true, body: { id: "PP-2", links: [{ rel: "approve", href: "https://y" }] } },
    ]);
    const provider = new PayPalProvider(buildSettings(CREDENTIALS));

    await provider.createOrder(input);
    await provider.createOrder(input);

    // Three calls, not four: one token, two orders.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("PayPalProvider.verifyWebhookSignature", () => {
  const body = Buffer.from(JSON.stringify({ id: "EV-1", event_type: "PAYMENT.CAPTURE.COMPLETED" }));
  const headers = {
    transmissionId: "t1",
    transmissionTime: "2026-07-31T00:00:00Z",
    transmissionSig: "sig",
    certUrl: "https://paypal/cert",
    authAlgo: "SHA256withRSA",
  };

  it("refuses when no webhook id is configured", async () => {
    const provider = new PayPalProvider(buildSettings({ ...CREDENTIALS, PAYPAL_WEBHOOK_ID: undefined }));
    await expect(provider.verifyWebhookSignature(body, headers)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it("accepts a SUCCESS verdict", async () => {
    mockFetchSequence([tokenResponse, { ok: true, body: { verification_status: "SUCCESS" } }]);
    const provider = new PayPalProvider(buildSettings(CREDENTIALS));

    const event = await provider.verifyWebhookSignature(body, headers);
    expect(event.id).toBe("EV-1");
  });

  it("rejects a FAILURE verdict", async () => {
    mockFetchSequence([tokenResponse, { ok: true, body: { verification_status: "FAILURE" } }]);
    const provider = new PayPalProvider(buildSettings(CREDENTIALS));

    await expect(provider.verifyWebhookSignature(body, headers)).rejects.toThrow(/FAILURE/);
  });

  it("fails closed when PayPal is unreachable", async () => {
    // The headline safety property: verification is a remote call, so a
    // network failure must mean "unverified", never "assume valid".
    // Otherwise anyone who can reach the endpoint could mark orders paid
    // whenever PayPal happened to be down.
    const fn = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ access_token: "tok", expires_in: 3600 }),
    });
    fn.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    global.fetch = fn as unknown as typeof fetch;

    const provider = new PayPalProvider(buildSettings(CREDENTIALS));
    await expect(provider.verifyWebhookSignature(body, headers)).rejects.toThrow();
  });

  it("rejects a webhook missing any signature header", async () => {
    const provider = new PayPalProvider(buildSettings(CREDENTIALS));

    for (const key of ["transmissionId", "transmissionTime", "transmissionSig", "certUrl", "authAlgo"]) {
      const partial = { ...headers, [key]: undefined };
      await expect(provider.verifyWebhookSignature(body, partial)).rejects.toThrow(/missing/i);
    }
  });
});

describe("PayPal event field extraction", () => {
  it("reads the order number from a capture event", () => {
    const event: PayPalEvent = { resource: { custom_id: "WS-9" } };
    expect(PayPalProvider.orderNumberFrom(event)).toBe("WS-9");
  });

  it("reads it from purchase_units when the event is order-shaped", () => {
    // PayPal puts the same value in different places by event type; missing
    // one shape means those webhooks silently do nothing.
    const event: PayPalEvent = { resource: { purchase_units: [{ custom_id: "WS-9" }] } };
    expect(PayPalProvider.orderNumberFrom(event)).toBe("WS-9");
  });

  it("returns null rather than guessing when neither is present", () => {
    expect(PayPalProvider.orderNumberFrom({ resource: {} })).toBeNull();
    expect(PayPalProvider.orderNumberFrom({})).toBeNull();
  });

  it("reads the paid amount from either shape", () => {
    expect(PayPalProvider.paidMinorUnitsFrom({ resource: { amount: { value: "19.99" } } })).toBe(1999);
    expect(
      PayPalProvider.paidMinorUnitsFrom({ resource: { purchase_units: [{ amount: { value: "5.00" } }] } }),
    ).toBe(500);
  });

  it("returns null for a missing amount so reconciliation can refuse", () => {
    // Null means "unknown", which the reconciliation step treats as a reason
    // not to mark an order paid — quite different from zero.
    expect(PayPalProvider.paidMinorUnitsFrom({ resource: {} })).toBeNull();
  });
});
