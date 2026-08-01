import { ServiceUnavailableException } from "@nestjs/common";
import { FlutterwaveProvider } from "./flutterwave.provider";
import { PaystackProvider } from "./paystack.provider";
import { PayPalProvider } from "./paypal.provider";
import type { SettingsService } from "../../settings/settings.service";
import type { ProviderRefundInput } from "./provider-refund";

/**
 * Refund paths, with the network mocked.
 *
 * These pin the request each provider *would* send and every branch of the
 * response handling. They cannot tell us the providers accept it — no refund
 * here has been run against a real sandbox account, which is recorded in
 * docs/PHASES.md as the outstanding risk.
 *
 * Stripe is covered separately (it goes through the SDK, not fetch).
 */
function buildSettings(values: Record<string, string | undefined>): SettingsService {
  return {
    get: jest.fn(async (key: string) => values[key]),
    isConfigured: jest.fn(async (key: string) => values[key] !== undefined),
  } as unknown as SettingsService;
}

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

const INPUT: ProviderRefundInput = {
  providerRef: "REF-1",
  orderNumber: "WS-1",
  amountMinorUnits: 1999,
  currency: "NGN",
  idempotencyKey: "key-1",
};

function bodyOf(fetchMock: jest.Mock, callIndex: number): Record<string, unknown> {
  return JSON.parse((fetchMock.mock.calls[callIndex] as never[])[1]["body"] as string);
}

function headersOf(fetchMock: jest.Mock, callIndex: number): Record<string, string> {
  return (fetchMock.mock.calls[callIndex] as never[])[1]["headers"] as Record<string, string>;
}

describe("PaystackProvider.refund", () => {
  it("refuses without a secret key", async () => {
    const provider = new PaystackProvider(buildSettings({}));
    await expect(provider.refund(INPUT)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("sends minor units and the stored transaction reference", async () => {
    const fetchMock = mockFetchSequence([
      { ok: true, body: { status: true, message: "ok", data: { id: 77, status: "processed" } } },
    ]);
    const provider = new PaystackProvider(buildSettings({ PAYSTACK_SECRET_KEY: "sk_test" }));

    const result = await provider.refund(INPUT);

    // Paystack works in kobo, the same unit we store, so no conversion.
    expect(bodyOf(fetchMock, 0).amount).toBe(1999);
    expect(bodyOf(fetchMock, 0).transaction).toBe("REF-1");
    expect(result).toEqual({
      providerRefundId: "77",
      status: "SUCCEEDED",
      raw: expect.anything(),
    });
  });

  it("reports an unsettled refund as PENDING rather than done", async () => {
    // Marking the order refunded on a "pending" would tell the customer the
    // money is back before it has left.
    mockFetchSequence([
      { ok: true, body: { status: true, message: "ok", data: { id: 78, status: "pending" } } },
    ]);
    const provider = new PaystackProvider(buildSettings({ PAYSTACK_SECRET_KEY: "sk_test" }));

    await expect(provider.refund(INPUT)).resolves.toMatchObject({ status: "PENDING" });
  });

  it("treats a business failure on HTTP 200 as a failure", async () => {
    mockFetchSequence([{ ok: true, body: { status: false, message: "Transaction not found" } }]);
    const provider = new PaystackProvider(buildSettings({ PAYSTACK_SECRET_KEY: "sk_test" }));

    await expect(provider.refund(INPUT)).rejects.toThrow(/Transaction not found/);
  });
});

describe("FlutterwaveProvider.refund", () => {
  const verifyOk = {
    ok: true,
    body: { status: "success", message: "ok", data: { id: 90210 } },
  };

  it("refuses without a secret key", async () => {
    const provider = new FlutterwaveProvider(buildSettings({}));
    await expect(provider.refund(INPUT)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("looks the transaction up by our reference, then refunds by numeric id", async () => {
    const fetchMock = mockFetchSequence([
      verifyOk,
      { ok: true, body: { status: "success", message: "ok", data: { id: 55, status: "completed" } } },
    ]);
    const provider = new FlutterwaveProvider(buildSettings({ FLUTTERWAVE_SECRET_KEY: "FLWSECK-x" }));

    const result = await provider.refund(INPUT);

    // The refund endpoint needs Flutterwave's numeric id, which we never
    // stored — hence the lookup by tx_ref first.
    expect(fetchMock.mock.calls[0][0]).toContain("verify_by_reference?tx_ref=WS-1");
    expect(fetchMock.mock.calls[1][0]).toContain("/transactions/90210/refund");
    expect(result.providerRefundId).toBe("55");
    expect(result.status).toBe("SUCCEEDED");
  });

  it("sends MAJOR units, not minor", async () => {
    // The bug this guards against refunds 100x the intended amount.
    const fetchMock = mockFetchSequence([
      verifyOk,
      { ok: true, body: { status: "success", message: "ok", data: { id: 55, status: "completed" } } },
    ]);
    const provider = new FlutterwaveProvider(buildSettings({ FLUTTERWAVE_SECRET_KEY: "FLWSECK-x" }));

    await provider.refund(INPUT);

    expect(bodyOf(fetchMock, 1).amount).toBe(19.99);
  });

  it("fails when the transaction cannot be found", async () => {
    mockFetchSequence([{ ok: true, body: { status: "error", message: "No transaction" } }]);
    const provider = new FlutterwaveProvider(buildSettings({ FLUTTERWAVE_SECRET_KEY: "FLWSECK-x" }));

    await expect(provider.refund(INPUT)).rejects.toThrow(/Could not find the Flutterwave transaction/);
  });

  it("fails when the refund itself is refused", async () => {
    mockFetchSequence([
      verifyOk,
      { ok: true, body: { status: "error", message: "Refund not permitted" } },
    ]);
    const provider = new FlutterwaveProvider(buildSettings({ FLUTTERWAVE_SECRET_KEY: "FLWSECK-x" }));

    await expect(provider.refund(INPUT)).rejects.toThrow(/Refund not permitted/);
  });
});

describe("PayPalProvider.refund", () => {
  const CREDENTIALS = {
    PAYPAL_CLIENT_ID: "client",
    PAYPAL_CLIENT_SECRET: "secret",
    PAYPAL_WEBHOOK_ID: "wh_1",
  };
  const token = { ok: true, body: { access_token: "tok", expires_in: 3600 } };

  it("refunds the capture and sends the idempotency header", async () => {
    const fetchMock = mockFetchSequence([
      token,
      { ok: true, body: { id: "RF-1", status: "COMPLETED" } },
    ]);
    const provider = new PayPalProvider(buildSettings(CREDENTIALS));

    const result = await provider.refund(INPUT);

    expect(fetchMock.mock.calls[1][0]).toContain("/v2/payments/captures/REF-1/refund");
    // PayPal's own idempotency guard, in addition to our unique constraint.
    expect(headersOf(fetchMock, 1)["PayPal-Request-Id"]).toBe("key-1");
    expect(bodyOf(fetchMock, 1).amount).toEqual({ value: "19.99", currency_code: "NGN" });
    expect(result).toEqual({ providerRefundId: "RF-1", status: "SUCCEEDED", raw: expect.anything() });
  });

  it("reports a PENDING refund as pending", async () => {
    mockFetchSequence([token, { ok: true, body: { id: "RF-2", status: "PENDING" } }]);
    const provider = new PayPalProvider(buildSettings(CREDENTIALS));

    await expect(provider.refund(INPUT)).resolves.toMatchObject({ status: "PENDING" });
  });

  it("falls back to resolving an order id when the reference is not a capture", async () => {
    // CHECKOUT.ORDER.APPROVED stores an order id, not a capture id, and
    // PayPal's ids carry no prefix to tell them apart — so the not-found is
    // the only signal available.
    const fetchMock = mockFetchSequence([
      token,
      { ok: false, status: 404, body: { name: "RESOURCE_NOT_FOUND" } },
      { ok: true, body: { purchase_units: [{ payments: { captures: [{ id: "CAP-9" }] } }] } },
      { ok: true, body: { id: "RF-3", status: "COMPLETED" } },
    ]);
    const provider = new PayPalProvider(buildSettings(CREDENTIALS));

    const result = await provider.refund(INPUT);

    expect(fetchMock.mock.calls[2][0]).toContain("/v2/checkout/orders/REF-1");
    expect(fetchMock.mock.calls[3][0]).toContain("/v2/payments/captures/CAP-9/refund");
    expect(result.providerRefundId).toBe("RF-3");
  });

  it("gives up when the reference is neither a capture nor a refundable order", async () => {
    mockFetchSequence([
      token,
      { ok: false, status: 404, body: { name: "RESOURCE_NOT_FOUND" } },
      { ok: true, body: { purchase_units: [] } },
    ]);
    const provider = new PayPalProvider(buildSettings(CREDENTIALS));

    await expect(provider.refund(INPUT)).rejects.toThrow(/Could not find a PayPal capture/);
  });

  it("does not retry as an order when PayPal refuses for another reason", async () => {
    // A declined refund must surface as a decline, not send us hunting for a
    // different resource to refund.
    const fetchMock = mockFetchSequence([
      token,
      { ok: false, status: 422, body: { name: "REFUND_NOT_ALLOWED", message: "Too late" } },
    ]);
    const provider = new PayPalProvider(buildSettings(CREDENTIALS));

    await expect(provider.refund(INPUT)).rejects.toThrow(/Too late/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
