import { ServiceUnavailableException } from "@nestjs/common";
import { StripeProvider } from "./stripe.provider";
import type { SettingsService } from "../../settings/settings.service";
import type { ProviderRefundInput } from "./provider-refund";

/**
 * Stripe refunds, with the SDK client replaced.
 *
 * Stripe is the one provider that goes through an SDK rather than `fetch`, so
 * the seam here is the cached client rather than the network. As with the
 * others: this proves our handling, not that Stripe accepts it.
 */
function buildSettings(values: Record<string, string | undefined>): SettingsService {
  return {
    get: jest.fn(async (key: string) => values[key]),
    isConfigured: jest.fn(async (key: string) => values[key] !== undefined),
  } as unknown as SettingsService;
}

interface FakeClient {
  refunds: { create: jest.Mock };
  checkout: { sessions: { retrieve: jest.Mock } };
}

function buildProvider(client: FakeClient): StripeProvider {
  const provider = new StripeProvider(buildSettings({ STRIPE_SECRET_KEY: "sk_test" }));
  // getClient() is private and builds a real Stripe instance; swap the cached
  // one so no HTTP is attempted.
  (provider as unknown as { getClient: () => Promise<FakeClient> }).getClient = async () => client;
  return provider;
}

const INPUT: ProviderRefundInput = {
  providerRef: "pi_123",
  orderNumber: "WS-1",
  amountMinorUnits: 1999,
  currency: "USD",
  idempotencyKey: "key-1",
};

function clientWith(refund: Record<string, unknown>, session?: Record<string, unknown>): FakeClient {
  return {
    refunds: { create: jest.fn(async () => refund) },
    checkout: { sessions: { retrieve: jest.fn(async () => session ?? {}) } },
  };
}

describe("StripeProvider.refund", () => {
  it("refunds a payment intent directly, passing the idempotency key", async () => {
    const client = clientWith({ id: "re_1", status: "succeeded" });
    const provider = buildProvider(client);

    const result = await provider.refund(INPUT);

    expect(client.refunds.create).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: "pi_123", amount: 1999 }),
      { idempotencyKey: "key-1" },
    );
    expect(result).toEqual({ providerRefundId: "re_1", status: "SUCCEEDED", raw: expect.anything() });
  });

  it("resolves a checkout session to its payment intent first", async () => {
    // What we store on a successful Stripe payment is the SESSION id. Passing
    // that to refunds.create fails, so it has to be resolved.
    const client = clientWith({ id: "re_2", status: "succeeded" }, { payment_intent: "pi_from_session" });
    const provider = buildProvider(client);

    await provider.refund({ ...INPUT, providerRef: "cs_test_123" });

    expect(client.checkout.sessions.retrieve).toHaveBeenCalledWith("cs_test_123");
    expect(client.refunds.create).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: "pi_from_session" }),
      expect.anything(),
    );
  });

  it("handles an expanded payment intent object on the session", async () => {
    const client = clientWith({ id: "re_3", status: "succeeded" }, { payment_intent: { id: "pi_expanded" } });
    const provider = buildProvider(client);

    await provider.refund({ ...INPUT, providerRef: "cs_test_123" });

    expect(client.refunds.create).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: "pi_expanded" }),
      expect.anything(),
    );
  });

  it("refuses a session that was never paid", async () => {
    const client = clientWith({ id: "re_4", status: "succeeded" }, { payment_intent: null });
    const provider = buildProvider(client);

    await expect(provider.refund({ ...INPUT, providerRef: "cs_unpaid" })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(client.refunds.create).not.toHaveBeenCalled();
  });

  it("refuses a reference that is neither an intent nor a session", async () => {
    const client = clientWith({ id: "re_5", status: "succeeded" });
    const provider = buildProvider(client);

    await expect(provider.refund({ ...INPUT, providerRef: "ch_legacy" })).rejects.toThrow(
      /not a payment intent or checkout session/,
    );
  });

  it("reports a pending refund as PENDING", async () => {
    const client = clientWith({ id: "re_6", status: "pending" });
    const provider = buildProvider(client);

    await expect(provider.refund(INPUT)).resolves.toMatchObject({ status: "PENDING" });
  });

  it("throws rather than reporting a failed refund as a state", async () => {
    // A "failed" refund moved no money. Returning it as a status would let
    // the order be marked refunded on the strength of a refusal.
    const client = clientWith({ id: "re_7", status: "failed", failure_reason: "insufficient_funds" });
    const provider = buildProvider(client);

    await expect(provider.refund(INPUT)).rejects.toThrow(/insufficient_funds/);
  });

  it("throws on a cancelled refund too", async () => {
    const client = clientWith({ id: "re_8", status: "canceled" });
    const provider = buildProvider(client);

    await expect(provider.refund(INPUT)).rejects.toThrow(/canceled/);
  });
});
