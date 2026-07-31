import { generateOrderNumber } from "./order-number";

describe("generateOrderNumber", () => {
  it("uses a WS-YYYYMMDD-HEX shape", () => {
    const number = generateOrderNumber(new Date("2026-07-30T12:00:00Z"));
    expect(number).toMatch(/^WS-20260730-[0-9A-F]{10}$/);
  });

  it("does not collide across many generations", () => {
    const generated = new Set(Array.from({ length: 5000 }, () => generateOrderNumber()));
    expect(generated.size).toBe(5000);
  });

  it("uses UTC so the date part doesn't shift with local timezone", () => {
    // 23:30 UTC on the 30th is already the 31st in some local zones; the
    // order number must follow UTC to stay stable across deploy regions.
    const number = generateOrderNumber(new Date("2026-07-30T23:30:00Z"));
    expect(number.startsWith("WS-20260730-")).toBe(true);
  });
});
