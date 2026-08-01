/**
 * The one shape every provider's refund speaks, so `PaymentsService` never
 * has to know which provider it is talking to.
 *
 * Amounts are **always minor units** here, whatever the provider's own wire
 * format uses. Conversion belongs inside the provider that needs it, next to
 * the tests that pin it — Flutterwave is the one that differs, and letting
 * that leak up here is how an order gets refunded a hundred times over.
 */
export interface ProviderRefundInput {
  /** Whatever we stored when the payment succeeded. Each provider knows how to read its own. */
  providerRef: string;
  /** Our order number. Some providers can only find a transaction by it. */
  orderNumber: string;
  amountMinorUnits: number;
  currency: string;
  /**
   * Passed to providers that support it, so a retried HTTP call is one refund
   * on their side too. Our own unique constraint is the real guard; this
   * closes the window where we crashed after calling out but before writing.
   */
  idempotencyKey: string;
}

export interface ProviderRefundResult {
  /** The provider's id for the refund, for reconciliation and support. */
  providerRefundId: string;
  /**
   * SUCCEEDED means the provider confirms the money is on its way back.
   * PENDING means it accepted the request but has not settled — common for
   * bank-backed methods, and NOT a failure. Failures throw instead, because
   * a caller that treats a failure as a state would leave the order looking
   * refunded when nothing moved.
   */
  status: "SUCCEEDED" | "PENDING";
  raw: unknown;
}
