import {
  applyPayment,
  balanceOf,
  computeFeeTotal,
  deriveInvoiceStatus,
  formatFeeInvoiceNumber,
  summariseFees,
} from "./fees-math";

describe("computeFeeTotal", () => {
  it("sums lines in minor units", () => {
    expect(
      computeFeeTotal([
        { label: "Tuition", amountCents: 25000000 },
        { label: "Books", amountCents: 750050 },
      ]),
    ).toBe(25750050);
  });

  it("treats an empty structure as zero rather than an error", () => {
    expect(computeFeeTotal([])).toBe(0);
  });

  it("refuses a fractional amount instead of rounding it", () => {
    // 4500.50 naira is 450050 kobo. Anyone passing 4500.5 has confused major
    // and minor units, and rounding it would bill the wrong number quietly.
    expect(() => computeFeeTotal([{ label: "Tuition", amountCents: 4500.5 }])).toThrow(/whole number/i);
  });

  it("refuses a negative amount", () => {
    expect(() => computeFeeTotal([{ label: "Discount", amountCents: -5000 }])).toThrow(/negative/i);
  });
});

describe("deriveInvoiceStatus", () => {
  it("is ISSUED when nothing has been paid", () => {
    expect(deriveInvoiceStatus(100000, 0, "ISSUED")).toBe("ISSUED");
  });

  it("is PARTIALLY_PAID part-way", () => {
    expect(deriveInvoiceStatus(100000, 40000, "ISSUED")).toBe("PARTIALLY_PAID");
  });

  it("is PAID exactly on settlement", () => {
    expect(deriveInvoiceStatus(100000, 100000, "PARTIALLY_PAID")).toBe("PAID");
  });

  it("settles a zero-total invoice immediately", () => {
    // A full scholarship or a fully waived invoice owes nothing. Leaving it
    // ISSUED would keep a family in the arrears report forever over 0.00.
    expect(deriveInvoiceStatus(0, 0, "ISSUED")).toBe("PAID");
  });

  it("never resurrects a voided invoice", () => {
    expect(deriveInvoiceStatus(100000, 100000, "VOID")).toBe("VOID");
  });

  it("leaves a draft alone", () => {
    expect(deriveInvoiceStatus(100000, 0, "DRAFT")).toBe("DRAFT");
  });
});

describe("applyPayment", () => {
  it("records a part payment and moves the status", () => {
    expect(applyPayment(100000, 0, "ISSUED", 25000)).toEqual({ paidCents: 25000, status: "PARTIALLY_PAID" });
  });

  it("settles an invoice when the final instalment lands", () => {
    expect(applyPayment(100000, 75000, "PARTIALLY_PAID", 25000)).toEqual({ paidCents: 100000, status: "PAID" });
  });

  it("refuses to take more than is owed", () => {
    // The money is real. Absorbing the excess would create an untracked
    // credit belonging to a family, so this fails loudly instead.
    expect(() => applyPayment(100000, 75000, "PARTIALLY_PAID", 30000)).toThrow(/larger than the outstanding/i);
  });

  it("refuses a payment against a settled invoice", () => {
    expect(() => applyPayment(100000, 100000, "PAID", 1)).toThrow(/already settled/i);
  });

  it("refuses zero and negative payments", () => {
    expect(() => applyPayment(100000, 0, "ISSUED", 0)).toThrow(/greater than zero/i);
    expect(() => applyPayment(100000, 0, "ISSUED", -5000)).toThrow(/greater than zero/i);
  });

  it("refuses a fractional payment", () => {
    expect(() => applyPayment(100000, 0, "ISSUED", 250.75)).toThrow(/whole number/i);
  });

  it("refuses payment against a voided or draft invoice", () => {
    expect(() => applyPayment(100000, 0, "VOID", 1000)).toThrow(/voided/i);
    expect(() => applyPayment(100000, 0, "DRAFT", 1000)).toThrow(/issued/i);
  });

  it("lets instalments add up exactly without drift", () => {
    // Thirds of 100000 don't divide evenly; doing this in floats is how a
    // balance ends up at 0.0000000001 and never reads as settled.
    let paid = 0;
    let status = "ISSUED" as ReturnType<typeof applyPayment>["status"];
    for (const amount of [33333, 33333, 33334]) {
      ({ paidCents: paid, status } = applyPayment(100000, paid, status, amount));
    }
    expect(paid).toBe(100000);
    expect(status).toBe("PAID");
    expect(balanceOf(100000, paid)).toBe(0);
  });
});

describe("formatFeeInvoiceNumber", () => {
  it("zero-pads so numbers sort lexicographically", () => {
    expect(formatFeeInvoiceNumber(1)).toBe("FEE-000001");
    expect(formatFeeInvoiceNumber(42)).toBe("FEE-000042");
    expect(formatFeeInvoiceNumber(123456)).toBe("FEE-123456");
  });

  it("rejects a non-positive sequence", () => {
    expect(() => formatFeeInvoiceNumber(0)).toThrow();
    expect(() => formatFeeInvoiceNumber(-1)).toThrow();
  });
});

describe("summariseFees", () => {
  it("keeps collected and outstanding separate", () => {
    const summary = summariseFees([
      { totalCents: 100000, paidCents: 100000, status: "PAID" },
      { totalCents: 100000, paidCents: 40000, status: "PARTIALLY_PAID" },
      { totalCents: 50000, paidCents: 0, status: "ISSUED" },
    ]);
    expect(summary).toEqual({ invoiced: 250000, collected: 140000, outstanding: 110000, invoiceCount: 3 });
  });

  it("excludes voided and draft invoices from every figure", () => {
    const summary = summariseFees([
      { totalCents: 100000, paidCents: 0, status: "ISSUED" },
      { totalCents: 999999, paidCents: 0, status: "VOID" },
      { totalCents: 888888, paidCents: 0, status: "DRAFT" },
    ]);
    expect(summary).toEqual({ invoiced: 100000, collected: 0, outstanding: 100000, invoiceCount: 1 });
  });

  it("reports zeroes rather than NaN for a school with no invoices", () => {
    expect(summariseFees([])).toEqual({ invoiced: 0, collected: 0, outstanding: 0, invoiceCount: 0 });
  });
});
