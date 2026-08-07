import {
  maskAccountNumber,
  toMaskedBankDetails,
  validateAccountNumber,
  validateBankCode,
  validateBankDetails,
} from "./bank-details";

describe("maskAccountNumber", () => {
  it("shows only the last four digits", () => {
    expect(maskAccountNumber("0123456789")).toBe("••••6789");
  });

  it("uses a fixed-width mask so the number's length is not revealed", () => {
    // The length of an account number narrows down the country and bank.
    // A 10-digit and an 18-digit number must mask identically.
    expect(maskAccountNumber("0123456789")).toBe("••••6789");
    expect(maskAccountNumber("012345678901236789")).toBe("••••6789");
    expect(maskAccountNumber("0123456789").length).toBe(maskAccountNumber("012345678901236789")?.length);
  });

  it("masks a short number completely rather than revealing all of it", () => {
    // "The last four" of a four-digit number is the whole number.
    expect(maskAccountNumber("1234")).toBe("••••");
    expect(maskAccountNumber("12")).toBe("••••");
  });

  it("returns null when there is nothing on file", () => {
    expect(maskAccountNumber(null)).toBeNull();
    expect(maskAccountNumber(undefined)).toBeNull();
    expect(maskAccountNumber("")).toBeNull();
    expect(maskAccountNumber("   ")).toBeNull();
  });

  it("never returns the input unchanged", () => {
    // The property that matters: whatever goes in, the full value does not
    // come back out.
    for (const input of ["1", "1234", "12345", "0123456789", "012345678901234567"]) {
      expect(maskAccountNumber(input)).not.toBe(input);
      expect(maskAccountNumber(input)).toContain("••••");
    }
  });
});

describe("validateAccountNumber", () => {
  it("accepts ordinary account numbers of varying length", () => {
    // 8 digits in some countries, 18 in others. Rejecting a valid one means
    // someone does not get paid.
    expect(validateAccountNumber("12345678")).toBeNull();
    expect(validateAccountNumber("0123456789")).toBeNull();
    expect(validateAccountNumber("012345678901234567")).toBeNull();
  });

  it("refuses anything that is not digits", () => {
    // A stray letter is a typo, and a typo here pays a stranger.
    expect(validateAccountNumber("01234O6789")).toMatch(/digits only/i);
    expect(validateAccountNumber("0123 456789")).toMatch(/digits only/i);
    expect(validateAccountNumber("01-2345678")).toMatch(/digits only/i);
  });

  it("refuses implausible lengths", () => {
    expect(validateAccountNumber("12345")).toMatch(/too short/i);
    expect(validateAccountNumber("123456789012345678901")).toMatch(/too long/i);
  });

  it("refuses an empty value", () => {
    expect(validateAccountNumber("")).toMatch(/needed/i);
    expect(validateAccountNumber("   ")).toMatch(/needed/i);
  });

  it("tolerates surrounding whitespace from a pasted spreadsheet cell", () => {
    expect(validateAccountNumber("  0123456789  ")).toBeNull();
  });
});

describe("validateBankCode", () => {
  it("accepts sort codes and routing numbers in common shapes", () => {
    expect(validateBankCode("044")).toBeNull();
    expect(validateBankCode("12-34-56")).toBeNull();
    expect(validateBankCode("ABC123")).toBeNull();
  });

  it("treats an empty code as simply absent", () => {
    expect(validateBankCode("")).toBeNull();
  });

  it("refuses obvious nonsense", () => {
    expect(validateBankCode("!!")).toMatch(/unexpected characters/i);
  });
});

describe("validateBankDetails", () => {
  it("accepts a complete set", () => {
    expect(
      validateBankDetails({
        bankName: "First Bank",
        bankCode: "011",
        accountName: "Ade Balogun",
        accountNumber: "0123456789",
      }),
    ).toBeNull();
  });

  it("accepts a record with no bank details at all", () => {
    // Not every staff member has been set up for payroll yet.
    expect(validateBankDetails({})).toBeNull();
    expect(validateBankDetails({ accountNumber: "" })).toBeNull();
    expect(validateBankDetails({ accountNumber: null })).toBeNull();
  });

  it("requires the name on the account whenever a number is given", () => {
    // Without it, a bounced payment cannot be traced back to a person —
    // exactly when someone needs to know whose account it was.
    expect(validateBankDetails({ accountNumber: "0123456789" })).toMatch(/name on the account/i);
    expect(validateBankDetails({ accountNumber: "0123456789", accountName: "  " })).toMatch(
      /name on the account/i,
    );
  });

  it("passes the account number problem through rather than a generic message", () => {
    expect(validateBankDetails({ accountNumber: "abc", accountName: "Ade" })).toMatch(/digits only/i);
  });
});

describe("toMaskedBankDetails", () => {
  it("produces a shape with nowhere to put the full number", () => {
    const masked = toMaskedBankDetails(
      { bankName: "First Bank", bankCode: "011", accountName: "Ade Balogun" },
      "0123456789",
    );
    expect(masked.accountNumberMasked).toBe("••••6789");
    expect(masked.hasAccountNumber).toBe(true);
    // The invariant: serialising this can never leak the account number,
    // because no field carries it.
    expect(JSON.stringify(masked)).not.toContain("0123456789");
    expect(JSON.stringify(masked)).not.toContain("012345");
  });

  it("reports no account number without inventing a mask", () => {
    const masked = toMaskedBankDetails({ bankName: "First Bank" }, null);
    expect(masked.accountNumberMasked).toBeNull();
    expect(masked.hasAccountNumber).toBe(false);
  });

  it("keeps the non-secret fields, which payroll setup needs to see", () => {
    const masked = toMaskedBankDetails(
      { bankName: "First Bank", bankCode: "011", accountName: "Ade Balogun" },
      "0123456789",
    );
    expect(masked.bankName).toBe("First Bank");
    expect(masked.bankCode).toBe("011");
    expect(masked.accountName).toBe("Ade Balogun");
  });
});
