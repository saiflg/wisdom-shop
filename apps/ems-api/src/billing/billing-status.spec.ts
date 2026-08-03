import type { InvoiceStatus, SubscriptionStatus } from "ems-control-client";
import {
  INVOICE_TRANSITIONS,
  SUBSCRIPTION_TRANSITIONS,
  canTransitionInvoice,
  canTransitionSubscription,
  explainInvoiceRefusal,
  explainSubscriptionRefusal,
  isInvoiceEditable,
} from "./billing-status";

const SUBSCRIPTION_STATUSES: SubscriptionStatus[] = ["TRIALING", "ACTIVE", "PAST_DUE", "CANCELED"];
const INVOICE_STATUSES: InvoiceStatus[] = ["DRAFT", "OPEN", "PAID", "VOID", "UNCOLLECTIBLE"];

describe("subscription transitions", () => {
  it("covers every status, so a new one can't be added without a decision", () => {
    expect(Object.keys(SUBSCRIPTION_TRANSITIONS).sort()).toEqual([...SUBSCRIPTION_STATUSES].sort());
  });

  it("never allows a no-op transition", () => {
    for (const status of SUBSCRIPTION_STATUSES) {
      expect(canTransitionSubscription(status, status)).toBe(false);
    }
  });

  it("treats CANCELED as terminal", () => {
    for (const to of SUBSCRIPTION_STATUSES) {
      expect(canTransitionSubscription("CANCELED", to)).toBe(false);
    }
    expect(explainSubscriptionRefusal("CANCELED", "ACTIVE")).toContain("create a new one");
  });

  it("allows the ordinary dunning cycle", () => {
    expect(canTransitionSubscription("TRIALING", "ACTIVE")).toBe(true);
    expect(canTransitionSubscription("ACTIVE", "PAST_DUE")).toBe(true);
    expect(canTransitionSubscription("PAST_DUE", "ACTIVE")).toBe(true);
  });

  it("never sends a subscription back to TRIALING", () => {
    // A trial is a one-time state; re-entering it would give free time away.
    for (const from of SUBSCRIPTION_STATUSES) {
      expect(canTransitionSubscription(from, "TRIALING")).toBe(false);
    }
  });

  it("always explains a refusal", () => {
    for (const from of SUBSCRIPTION_STATUSES) {
      for (const to of SUBSCRIPTION_STATUSES) {
        if (!canTransitionSubscription(from, to)) expect(explainSubscriptionRefusal(from, to)).toBeTruthy();
      }
    }
  });
});

describe("invoice transitions", () => {
  it("covers every status", () => {
    expect(Object.keys(INVOICE_TRANSITIONS).sort()).toEqual([...INVOICE_STATUSES].sort());
  });

  it("never allows a no-op transition", () => {
    for (const status of INVOICE_STATUSES) {
      expect(canTransitionInvoice(status, status)).toBe(false);
    }
  });

  it("treats PAID and VOID as terminal", () => {
    // Rewriting a settled invoice is an accounting problem, not an edit.
    for (const to of INVOICE_STATUSES) {
      expect(canTransitionInvoice("PAID", to)).toBe(false);
      expect(canTransitionInvoice("VOID", to)).toBe(false);
    }
    expect(explainInvoiceRefusal("PAID", "DRAFT")).toContain("credit note");
  });

  it("never lets an invoice return to DRAFT once issued", () => {
    for (const from of INVOICE_STATUSES) {
      if (from === "DRAFT") continue;
      expect(canTransitionInvoice(from, "DRAFT")).toBe(false);
    }
  });

  it("allows the ordinary lifecycle and write-off recovery", () => {
    expect(canTransitionInvoice("DRAFT", "OPEN")).toBe(true);
    expect(canTransitionInvoice("OPEN", "PAID")).toBe(true);
    expect(canTransitionInvoice("OPEN", "UNCOLLECTIBLE")).toBe(true);
    // A written-off invoice that is eventually paid must be recordable.
    expect(canTransitionInvoice("UNCOLLECTIBLE", "PAID")).toBe(true);
  });

  it("only treats DRAFT as editable", () => {
    expect(isInvoiceEditable("DRAFT")).toBe(true);
    for (const status of INVOICE_STATUSES.filter((s) => s !== "DRAFT")) {
      expect(isInvoiceEditable(status)).toBe(false);
    }
  });

  it("always explains a refusal", () => {
    for (const from of INVOICE_STATUSES) {
      for (const to of INVOICE_STATUSES) {
        if (!canTransitionInvoice(from, to)) expect(explainInvoiceRefusal(from, to)).toBeTruthy();
      }
    }
  });
});
