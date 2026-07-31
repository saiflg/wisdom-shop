import {
  INDEX_SETTINGS,
  isIndexable,
  toSearchDocument,
  type IndexableProduct,
  PRIMARY_KEY,
} from "./search-document";

function product(overrides: Partial<IndexableProduct> = {}): IndexableProduct {
  return {
    id: "p1",
    title: "Algebra Basics",
    description: "An introduction to algebra.",
    slug: "algebra-basics",
    type: "DIGITAL",
    status: "PUBLISHED",
    priceCents: 1999,
    currency: "USD",
    sku: "ALG-1",
    vendorId: null,
    categories: [{ category: { slug: "books", name: "Books" } }],
    ...overrides,
  };
}

describe("isIndexable", () => {
  it("indexes published products", () => {
    expect(isIndexable(product())).toBe(true);
  });

  it.each(["DRAFT", "ARCHIVED"])("keeps %s products out of the index entirely", (status) => {
    // Filtering at query time would work right until someone forgot the
    // filter. Keeping drafts out means an unreleased title cannot leak
    // through search however the query is written.
    expect(isIndexable(product({ status }))).toBe(false);
  });
});

describe("toSearchDocument", () => {
  it("carries the fields a shopper searches by", () => {
    const doc = toSearchDocument(product());

    expect(doc).toMatchObject({
      id: "p1",
      title: "Algebra Basics",
      slug: "algebra-basics",
      sku: "ALG-1",
      priceCents: 1999,
      categorySlugs: ["books"],
      categoryNames: ["Books"],
    });
  });

  it("has more than one field ending in \"id\", which is why the primary key is declared", () => {
    // Meilisearch infers the primary key from field names and REFUSES when
    // several fields end in "id". This document has `id` and `vendorId`, so
    // inference fails and every write is silently rejected — the index stays
    // empty while searches still return 200.
    //
    // This test exists so that failure mode is visible here rather than in
    // production. If it ever goes green with only one candidate, the explicit
    // PRIMARY_KEY is still correct; do not take it as licence to remove it.
    const candidates = Object.keys(toSearchDocument(product())).filter((key) =>
      key.toLowerCase().endsWith("id"),
    );

    expect(candidates.length).toBeGreaterThan(1);
    expect(candidates).toContain(PRIMARY_KEY);
  });

  it("does not publish stock levels or internal state", () => {
    // The index is queried by the public storefront; anything in a document
    // is effectively public even if no screen shows it today.
    const doc = toSearchDocument(product()) as unknown as Record<string, unknown>;

    expect(doc).not.toHaveProperty("stockQty");
    expect(doc).not.toHaveProperty("status");
    expect(doc).not.toHaveProperty("metadata");
    expect(doc).not.toHaveProperty("deletedAt");
  });

  it("handles a product with no categories", () => {
    expect(toSearchDocument(product({ categories: [] })).categorySlugs).toEqual([]);
    expect(toSearchDocument(product({ categories: undefined })).categorySlugs).toEqual([]);
  });

  it("keeps the vendor id so a vendor's listings can be filtered", () => {
    expect(toSearchDocument(product({ vendorId: "v1" })).vendorId).toBe("v1");
  });
});

describe("index settings", () => {
  it("ranks the title above the description", () => {
    // Meilisearch weights searchable attributes by their order, so a word in
    // the blurb should not outrank the same word in the name of the thing.
    const { searchableAttributes } = INDEX_SETTINGS;
    expect(searchableAttributes.indexOf("title")).toBeLessThan(
      searchableAttributes.indexOf("description"),
    );
  });

  it("makes the listing filters filterable", () => {
    // These are the filters the storefront already offers; a filterable
    // attribute missing here fails at query time, not at startup.
    expect(INDEX_SETTINGS.filterableAttributes).toEqual(
      expect.arrayContaining(["type", "categorySlugs", "priceCents"]),
    );
  });
});
