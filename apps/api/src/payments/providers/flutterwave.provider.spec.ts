import { ServiceUnavailableException } from "@nestjs/common";
import { FlutterwaveProvider } from "./flutterwave.provider";
import type { SettingsService } from "../../settings/settings.service";

/**
 * The network is mocked throughout — see the warning on the provider. These
 * tests pin the request we *would* send and every branch of the response
 * handling; they cannot tell us Flutterwave accepts it.
 */
function buildSettings(values: Record<string, string | undefined>): SettingsService {
  return {
    get: jest.fn(async (key: string) => values[key]),
    isConfigured: jest.fn(async (key: string) => values[key] !== undefined),
  } as unknown as SettingsService;
}

function mockFetch(response: { ok: boolean; status?: number; body: unknown }) {
  const fn = jest.fn(async () => ({
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 500),
    json: async () => response.body,
  }));
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

describe("FlutterwaveProvider amount conversion", () => {
  it("converts minor units to the major units Flutterwave expects", () => {
    // The one integration here that does not take minor units — getting this
    // backwards would charge 100x or 1/100th of the intended amount.
    expect(FlutterwaveProvider.toMajorUnits(1050)).toBe(10.5);
    expect(FlutterwaveProvider.toMajorUnits(1999)).toBe(19.99);
    expect(FlutterwaveProvider.toMajorUnits(100)).toBe(1);
    expect(FlutterwaveProvider.toMajorUnits(0)).toBe(0);
  });

  it("converts a webhook amount back to minor units", () => {
    expect(FlutterwaveProvider.toMinorUnits(10.5)).toBe(1050);
    expect(FlutterwaveProvider.toMinorUnits(19.99)).toBe(1999);
  });

  it("round-trips without drifting on binary floating point", () => {
    // 19.99 * 100 is 1998.9999999999998; a truncation here would under-charge
    // by a cent on a large share of prices.
    for (const cents of [1, 7, 99, 100, 1999, 123456]) {
      expect(FlutterwaveProvider.toMinorUnits(FlutterwaveProvider.toMajorUnits(cents))).toBe(cents);
    }
  });
});

describe("FlutterwaveProvider.initializePayment", () => {
  const input = {
    orderNumber: "WS-1",
    amountMinorUnits: 1999,
    currency: "NGN",
    customerEmail: "buyer@example.com",
    redirectUrl: "https://shop.example/orders/WS-1",
  };

  it("refuses to start without a secret key", async () => {
    const provider = new FlutterwaveProvider(buildSettings({}));
    await expect(provider.initializePayment(input)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("sends the amount in major units and the order number as the reference", async () => {
    const fetchMock = mockFetch({
      ok: true,
      body: { status: "success", message: "ok", data: { link: "https://pay.flutterwave/x" } },
    });
    const provider = new FlutterwaveProvider(buildSettings({ FLUTTERWAVE_SECRET_KEY: "FLWSECK-x" }));

    const result = await provider.initializePayment(input);

    const body = JSON.parse((fetchMock.mock.calls[0] as never[])[1]["body"] as string);
    expect(body.amount).toBe(19.99);
    expect(body.tx_ref).toBe("WS-1");
    expect(body.meta.orderNumber).toBe("WS-1");
    expect(result.redirectUrl).toBe("https://pay.flutterwave/x");
  });

  it("treats a non-success payload as a failure even on HTTP 200", async () => {
    // Flutterwave reports business failures in the body, not the status code.
    mockFetch({ ok: true, body: { status: "error", message: "no" } });
    const provider = new FlutterwaveProvider(buildSettings({ FLUTTERWAVE_SECRET_KEY: "FLWSECK-x" }));

    await expect(provider.initializePayment(input)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("fails when the response carries no payment link", async () => {
    mockFetch({ ok: true, body: { status: "success", message: "ok", data: {} } });
    const provider = new FlutterwaveProvider(buildSettings({ FLUTTERWAVE_SECRET_KEY: "FLWSECK-x" }));

    await expect(provider.initializePayment(input)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe("FlutterwaveProvider.verifyWebhookSignature", () => {
  const body = Buffer.from(JSON.stringify({ event: "charge.completed", data: { tx_ref: "WS-1" } }));

  it("refuses when no webhook hash is configured", async () => {
    const provider = new FlutterwaveProvider(buildSettings({}));
    // A webhook that cannot be authenticated must never be trusted.
    await expect(provider.verifyWebhookSignature(body, "anything")).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it("accepts the configured hash", async () => {
    const provider = new FlutterwaveProvider(buildSettings({ FLUTTERWAVE_WEBHOOK_HASH: "s3cret" }));
    const event = await provider.verifyWebhookSignature(body, "s3cret");
    expect(event.data.tx_ref).toBe("WS-1");
  });

  it("rejects a wrong hash", async () => {
    const provider = new FlutterwaveProvider(buildSettings({ FLUTTERWAVE_WEBHOOK_HASH: "s3cret" }));
    await expect(provider.verifyWebhookSignature(body, "wrong!")).rejects.toThrow(/mismatch/i);
  });

  it("rejects a hash of a different length without throwing on the compare", async () => {
    // timingSafeEqual throws on unequal lengths, so the length is checked
    // first — otherwise a short header is a crash, not a rejection.
    const provider = new FlutterwaveProvider(buildSettings({ FLUTTERWAVE_WEBHOOK_HASH: "s3cret" }));
    await expect(provider.verifyWebhookSignature(body, "s")).rejects.toThrow(/mismatch/i);
    await expect(provider.verifyWebhookSignature(body, "")).rejects.toThrow(/mismatch/i);
  });
});
