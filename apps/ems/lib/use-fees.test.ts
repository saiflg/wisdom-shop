import { formatMoney, parseMoneyToCents } from "./use-fees";

describe("parseMoneyToCents", () => {
  it("reads whole and fractional amounts as minor units", () => {
    expect(parseMoneyToCents("25000")).toBe(2500000);
    expect(parseMoneyToCents("25000.50")).toBe(2500050);
    expect(parseMoneyToCents("0.05")).toBe(5);
  });

  it("pads a single decimal place rather than misreading it", () => {
    // "10.5" is ten naira fifty kobo, not ten naira five kobo.
    expect(parseMoneyToCents("10.5")).toBe(1050);
  });

  it("tolerates thousands separators and surrounding space", () => {
    expect(parseMoneyToCents(" 1,250,000.25 ")).toBe(125000025);
  });

  it("returns null for anything that isn't a clean money value", () => {
    // Refusing beats guessing: the caller shows an error instead of
    // silently billing a number nobody typed.
    expect(parseMoneyToCents("")).toBeNull();
    expect(parseMoneyToCents("abc")).toBeNull();
    expect(parseMoneyToCents("-500")).toBeNull();
    expect(parseMoneyToCents("12.345")).toBeNull();
    expect(parseMoneyToCents("1.2.3")).toBeNull();
  });

  it("does not drift on values that break float multiplication", () => {
    // Math.round(4500.55 * 100) is the classic off-by-one-kobo bug. The
    // string path cannot produce it.
    expect(parseMoneyToCents("4500.55")).toBe(450055);
    expect(parseMoneyToCents("1.15")).toBe(115);
    expect(parseMoneyToCents("1.16")).toBe(116);
  });
});

describe("formatMoney", () => {
  it("renders minor units without float maths", () => {
    expect(formatMoney(2500050, "NGN")).toBe("NGN 25,000.50");
    expect(formatMoney(5, "NGN")).toBe("NGN 0.05");
    expect(formatMoney(0, "USD")).toBe("USD 0.00");
  });

  it("round-trips with the parser", () => {
    for (const input of ["25000.50", "0.05", "1250000.25", "999.99"]) {
      const cents = parseMoneyToCents(input) as number;
      expect(formatMoney(cents, "NGN").replace("NGN ", "").replace(/,/g, "")).toBe(
        Number(input).toFixed(2),
      );
    }
  });

  it("shows a negative balance rather than hiding the sign", () => {
    expect(formatMoney(-2500, "NGN")).toBe("-NGN 25.00");
  });
});
