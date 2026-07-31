import {
  emptyProductForm,
  formatCentsForInput,
  parsePriceToCents,
  ProductFormError,
  toProductPayload,
  type ProductFormValues,
} from "@/lib/product-form";

const form = (overrides: Partial<ProductFormValues> = {}): ProductFormValues => ({
  ...emptyProductForm,
  title: "A Book",
  description: "About things.",
  price: "19.99",
  ...overrides,
});

describe("parsePriceToCents", () => {
  it("converts the classic floating-point trap correctly", () => {
    // 19.99 * 100 is 1998.9999999999998 in binary floating point. Truncating
    // anywhere in that chain sells the product a cent cheap, silently.
    expect(parsePriceToCents("19.99")).toBe(1999);
    expect(parsePriceToCents("0.07")).toBe(7);
    expect(parsePriceToCents("1.10")).toBe(110);
    expect(parsePriceToCents("8.20")).toBe(820);
    expect(parsePriceToCents("1234.56")).toBe(123456);
  });

  it("handles whole amounts and zero", () => {
    expect(parsePriceToCents("5")).toBe(500);
    expect(parsePriceToCents("0")).toBe(0);
  });

  it("refuses anything that is not a plain amount", () => {
    // Number() would accept several of these and produce a wrong price
    // rather than an error.
    expect(parsePriceToCents("")).toBeNull();
    expect(parsePriceToCents("  ")).toBeNull();
    expect(parsePriceToCents("abc")).toBeNull();
    expect(parsePriceToCents("12abc")).toBeNull();
    expect(parsePriceToCents("1e5")).toBeNull();
    expect(parsePriceToCents("-5")).toBeNull();
    expect(parsePriceToCents("1.999")).toBeNull();
    expect(parsePriceToCents("Infinity")).toBeNull();
  });

  it("round-trips through the input formatter", () => {
    for (const cents of [0, 7, 110, 1999, 123456]) {
      expect(parsePriceToCents(formatCentsForInput(cents))).toBe(cents);
    }
  });
});

describe("toProductPayload", () => {
  it("sends the price in minor units", () => {
    expect(toProductPayload(form({ price: "19.99" }), true).priceCents).toBe(1999);
  });

  it("refuses to build a payload with an unusable price", () => {
    expect(() => toProductPayload(form({ price: "free" }), true)).toThrow(ProductFormError);
    expect(() => toProductPayload(form({ price: "" }), true)).toThrow(/price/i);
  });

  it("omits optional fields rather than sending them empty", () => {
    // The API generates a slug when one is absent, but rejects an empty
    // string against its pattern — so blank must mean omitted.
    const payload = toProductPayload(form(), true);
    expect(payload).not.toHaveProperty("slug");
    expect(payload).not.toHaveProperty("sku");
    expect(payload).not.toHaveProperty("stockQty");
    expect(payload).not.toHaveProperty("categoryIds");
    expect(payload).not.toHaveProperty("images");
  });

  it("includes optional fields once they are filled in", () => {
    const payload = toProductPayload(
      form({ slug: "a-book", sku: "BK-1", stockQty: "12", categoryIds: ["cat_1"] }),
      true,
    );
    expect(payload.slug).toBe("a-book");
    expect(payload.sku).toBe("BK-1");
    expect(payload.stockQty).toBe(12);
    expect(payload.categoryIds).toEqual(["cat_1"]);
  });

  it("treats blank stock as unlimited rather than zero", () => {
    // Sending 0 would mark every digital product out of stock and block
    // checkout for it.
    const payload = toProductPayload(form({ stockQty: "" }), true);
    expect(payload).not.toHaveProperty("stockQty");
    expect(toProductPayload(form({ stockQty: "0" }), true).stockQty).toBe(0);
  });

  it("refuses a fractional stock count", () => {
    expect(() => toProductPayload(form({ stockQty: "2.5" }), true)).toThrow(/whole number/i);
  });

  it("turns pasted image URLs into positioned images, ignoring blank lines", () => {
    const payload = toProductPayload(
      form({ imageUrls: "https://a.example/1.png\n\n  https://a.example/2.png  \n" }),
      true,
    );
    expect(payload.images).toEqual([
      { url: "https://a.example/1.png", position: 0 },
      { url: "https://a.example/2.png", position: 1 },
    ]);
  });

  it("does not send a status when creating", () => {
    // The API always creates as DRAFT; sending a status would imply the form
    // can publish straight away, which it cannot.
    expect(toProductPayload(form({ status: "PUBLISHED" }), true)).not.toHaveProperty("status");
    expect(toProductPayload(form({ status: "PUBLISHED" }), false).status).toBe("PUBLISHED");
  });

  it("normalises the currency code", () => {
    expect(toProductPayload(form({ currency: " usd " }), true).currency).toBe("USD");
  });

  it("trims text so a stray space cannot create a near-duplicate", () => {
    const payload = toProductPayload(form({ title: "  A Book  " }), true);
    expect(payload.title).toBe("A Book");
  });
});
