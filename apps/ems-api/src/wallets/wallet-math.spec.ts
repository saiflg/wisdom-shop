import {
  balanceOf,
  directionOf,
  formatAmount,
  isOverdraft,
  signedAmount,
  validateAmount,
} from "./wallet-math";

describe("directionOf", () => {
  it("credits money in and debits money out", () => {
    expect(directionOf("TOPUP")).toBe(1);
    expect(directionOf("ADJUSTMENT_CREDIT")).toBe(1);
    expect(directionOf("SPEND")).toBe(-1);
    expect(directionOf("REFUND")).toBe(-1);
    expect(directionOf("ADJUSTMENT_DEBIT")).toBe(-1);
  });

  it("treats a refund as money leaving the wallet", () => {
    // Worth pinning down because "refund" sounds like money arriving. It is
    // money going back to the family, so the wallet goes down.
    expect(signedAmount("REFUND", 50_000)).toBe(-50_000);
  });
});

describe("signedAmount", () => {
  it("decides the sign from the kind, not from the caller", () => {
    expect(signedAmount("TOPUP", 250_000)).toBe(250_000);
    expect(signedAmount("SPEND", 250_000)).toBe(-250_000);
  });

  it("refuses a negative amount instead of quietly flipping it", () => {
    // A SPEND of -500 would otherwise become a credit of 500. Silently
    // correcting that would be the most expensive kind of helpfulness here.
    expect(() => signedAmount("SPEND", -500)).toThrow("The amount must be above zero");
  });

  it("refuses a fractional minor unit", () => {
    // Not a rounding question: it means somebody multiplied by a hundred in
    // the wrong place, and accepting it puts the mistake beyond reach.
    expect(() => signedAmount("TOPUP", 10.5)).toThrow("Amounts must be in whole minor units");
  });

  it("refuses zero", () => {
    expect(() => signedAmount("TOPUP", 0)).toThrow("The amount must be above zero");
  });
});

describe("validateAmount", () => {
  it("accepts an ordinary amount", () => {
    expect(validateAmount(500_00)).toBeNull();
  });

  it("rejects what is not a number at all", () => {
    expect(validateAmount(Number.NaN)).toBe("That amount is not a number");
    expect(validateAmount(Number.POSITIVE_INFINITY)).toBe("That amount is not a number");
  });

  it("puts a ceiling on a single movement", () => {
    // A typo of two extra zeros on a top-up is easier to refuse than to undo.
    expect(validateAmount(1_000_000_01)).toBe("That amount is larger than this screen will accept");
  });
});

describe("balanceOf", () => {
  it("adds signed entries", () => {
    expect(balanceOf([{ amountCents: 500_00 }, { amountCents: -120_00 }, { amountCents: -30_00 }])).toBe(350_00);
  });

  it("is zero for a wallet nothing has happened to", () => {
    expect(balanceOf([])).toBe(0);
  });

  it("stays exact over many small movements", () => {
    // Integer minor units exist precisely so this cannot drift. The same sum
    // in naira-as-float does not come back to a round number.
    const entries = Array.from({ length: 1000 }, () => ({ amountCents: 1 }));
    expect(balanceOf(entries)).toBe(1000);
  });
});

describe("isOverdraft", () => {
  it("recognises the balance guard firing", () => {
    expect(
      isOverdraft({ message: 'new row violates check constraint "student_wallets_balance_not_negative"' }),
    ).toBe(true);
    expect(isOverdraft({ meta: { constraint: "student_wallets_balance_not_negative" } })).toBe(true);
  });

  it("does not report an unrelated constraint as not enough money", () => {
    // The point of matching on the name. Telling a bursar there is not enough
    // money when the real problem was a duplicate reference sends them
    // looking for a payment that was never missing.
    expect(isOverdraft({ message: 'duplicate key value violates unique constraint "wallet_entries_walletId_reference_key"' })).toBe(
      false,
    );
    expect(isOverdraft({ message: "connection terminated" })).toBe(false);
    expect(isOverdraft(null)).toBe(false);
  });
});

describe("formatAmount", () => {
  it("shows minor units as two decimal places", () => {
    expect(formatAmount(123456)).toBe("1,234.56");
    expect(formatAmount(5)).toBe("0.05");
    expect(formatAmount(0)).toBe("0.00");
  });

  it("keeps the minus on a debit", () => {
    expect(formatAmount(-2500)).toBe("-25.00");
  });
});
