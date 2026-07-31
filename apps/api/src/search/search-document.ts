/**
 * What a product looks like in the search index.
 *
 * Pure, so the two things that matter can be tested without a search engine:
 * what becomes searchable, and what must never end up in there.
 */

export const PRODUCTS_INDEX = "products";

export interface IndexableProduct {
  id: string;
  title: string;
  description: string;
  slug: string;
  type: string;
  status: string;
  priceCents: number;
  currency: string;
  sku: string | null;
  vendorId: string | null;
  categories?: { category: { slug: string; name: string } }[];
}

export interface ProductDocument {
  id: string;
  title: string;
  description: string;
  slug: string;
  type: string;
  priceCents: number;
  currency: string;
  sku: string | null;
  vendorId: string | null;
  categorySlugs: string[];
  categoryNames: string[];
}

/**
 * Only published products belong in the index.
 *
 * Filtering at query time would work right up until someone forgot the
 * filter; keeping drafts out entirely means an unreleased title cannot leak
 * through search however the query is written.
 */
export function isIndexable(product: Pick<IndexableProduct, "status">): boolean {
  return product.status === "PUBLISHED";
}

export function toSearchDocument(product: IndexableProduct): ProductDocument {
  return {
    id: product.id,
    title: product.title,
    description: product.description,
    slug: product.slug,
    type: product.type,
    priceCents: product.priceCents,
    currency: product.currency,
    sku: product.sku,
    vendorId: product.vendorId,
    categorySlugs: (product.categories ?? []).map((c) => c.category.slug),
    categoryNames: (product.categories ?? []).map((c) => c.category.name),
  };
}

/**
 * Index settings.
 *
 * `description` is searchable but ranked below the title — a word in the
 * blurb should not outrank the same word in the name of the thing.
 */
export const INDEX_SETTINGS = {
  searchableAttributes: ["title", "categoryNames", "sku", "description"],
  filterableAttributes: ["type", "categorySlugs", "priceCents", "currency", "vendorId"],
  sortableAttributes: ["priceCents"],
} as const;
