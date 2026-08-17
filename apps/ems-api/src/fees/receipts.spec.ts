import {
  buildReceipt,
  describeBalance,
  describeMethod,
  formatAmount,
  formatReceiptDate,
  formatReceiptNumber,
} from "./receipts";

describe("formatReceiptNumber", () => {
  it("zero-pads so receipts sort lexicographically, like invoices", () => {
    expect(formatReceiptNumber(1)).toBe("RCT-000001");
    expect(formatReceiptNumber(42)).toBe("RCT-000042");
    expect([formatReceiptNumber(9), formatReceiptNumber(10)].sort()).toEqual(["RCT-000009", "RCT-000010"]);
  });

  it("refuses a sequence that is not a positive whole number", () => {
    // A receipt numbered RCT-000000 or RCT-NaN is worse than a failed write.
    expect(() => formatReceiptNumber(0)).toThrow(/positive whole number/);
    expect(() => formatReceiptNumber(-1)).toThrow();
    expect(() => formatReceiptNumber(1.5)).toThrow();
  });

  it("is visibly different from an invoice number", () => {
    // A parent quoting "FEE-000004" when they mean the receipt sends a bursar
    // to the wrong record.
    expect(formatReceiptNumber(4)).not.toContain("FEE-");
  });
});

describe("describeMethod", () => {
  it("turns a stored value into something a parent reads", () => {
    expect(describeMethod("BANK_TRANSFER")).toBe("bank transfer");
    expect(describeMethod("GATEWAY")).toBe("online payment");
    expect(describeMethod("CASH")).toBe("cash");
  });

  it("degrades sensibly for a method it has not been taught", () => {
    expect(describeMethod("MOBILE_MONEY")).toBe("mobile money");
  });
});

describe("describeBalance", () => {
  it("says 'paid in full' rather than printing a zero", () => {
    // "Balance: 0.00" makes a parent look twice to decide if that is good news.
    expect(describeBalance(0, "NGN")).toBe("This invoice is now paid in full.");
  });

  it("treats an overpayment as paid in full, never as a negative", () => {
    // A negative balance reads as though the school owes the family money.
    expect(describeBalance(-5000, "NGN")).toBe("This invoice is now paid in full.");
  });

  it("names what is left when something is left", () => {
    expect(describeBalance(2_500_00, "NGN")).toBe("NGN 2,500.00 is still outstanding.");
  });
});

describe("formatAmount", () => {
  it("always shows two decimal places", () => {
    expect(formatAmount(5000, "NGN")).toBe("NGN 50.00");
    expect(formatAmount(0, "NGN")).toBe("NGN 0.00");
  });

  it("groups thousands, because school fees are big numbers", () => {
    expect(formatAmount(1_250_000_00, "NGN")).toBe("NGN 1,250,000.00");
  });
});

describe("formatReceiptDate", () => {
  it("is a date a person reads, not a timestamp", () => {
    expect(formatReceiptDate(new Date("2026-08-17T09:30:00.000Z"))).toBe("17 August 2026");
  });

  it("reads in UTC, so a late-evening payment is not dated the next day", () => {
    expect(formatReceiptDate(new Date("2026-08-17T23:30:00.000Z"))).toBe("17 August 2026");
  });
});

describe("buildReceipt", () => {
  const base = {
    receiptNumber: "RCT-000001",
    invoiceNumber: "FEE-000004",
    studentName: "Tunde Adewale",
    amountCents: 50_000_00,
    totalCents: 120_000_00,
    paidCents: 50_000_00,
    currency: "NGN",
    method: "GATEWAY",
    receivedAt: new Date("2026-08-17T09:30:00.000Z"),
  };

  it("says how much arrived and what remains", () => {
    const receipt = buildReceipt(base);
    expect(receipt.amountPaid).toBe("NGN 50,000.00");
    expect(receipt.balance).toBe("NGN 70,000.00 is still outstanding.");
    expect(receipt.settled).toBe(false);
  });

  it("marks a settled invoice as settled", () => {
    const receipt = buildReceipt({ ...base, paidCents: base.totalCents, amountCents: 70_000_00 });
    expect(receipt.settled).toBe(true);
    expect(receipt.balance).toMatch(/paid in full/);
    expect(receipt.balanceCents).toBe(0);
  });

  it("never reports a negative balance after an overpayment", () => {
    const receipt = buildReceipt({ ...base, paidCents: 130_000_00 });
    expect(receipt.balanceCents).toBe(0);
    expect(receipt.settled).toBe(true);
  });

  it("distinguishes this payment from the total paid so far", () => {
    // The commonest confusion on a receipt: "did they charge me 50 or 120?"
    const receipt = buildReceipt({ ...base, amountCents: 20_000_00, paidCents: 70_000_00 });
    expect(receipt.amountPaid).toBe("NGN 20,000.00");
    expect(receipt.paidToDate).toBe("NGN 70,000.00");
    expect(receipt.invoiceTotal).toBe("NGN 120,000.00");
  });

  it("carries both numbers, so a parent can quote either", () => {
    const receipt = buildReceipt(base);
    expect(receipt.receiptNumber).toBe("RCT-000001");
    expect(receipt.invoiceNumber).toBe("FEE-000004");
  });

  it("describes the method in words", () => {
    expect(buildReceipt(base).method).toBe("online payment");
  });
});
