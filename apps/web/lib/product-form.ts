/**
 * Translating between the product form and the API payload.
 *
 * Kept out of the component because the money conversion is the part most
 * likely to be silently wrong: the API stores minor units (cents) and the
 * form shows a decimal amount, so a rounding slip here misprices the
 * catalogue without erroring anywhere.
 */

export interface ProductFormValues {
  title: string;
  slug: string;
  description: string;
  type: string;
  /** As typed by a human: "19.99". */
  price: string;
  currency: string;
  sku: string;
  /** Blank means unlimited, which is what digital goods want. */
  stockQty: string;
  status: string;
  categoryIds: string[];
  imageUrls: string;
}

export const PRODUCT_TYPES = [
  "PHYSICAL",
  "DIGITAL",
  "SUBSCRIPTION",
  "LICENSE",
  "DOWNLOADABLE",
  "SOFTWARE",
  "SERVICE",
  "BUNDLE",
  "GIFT_CARD",
  "MEMBERSHIP",
  "COURSE",
] as const;

export const PRODUCT_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;

export const emptyProductForm: ProductFormValues = {
  title: "",
  slug: "",
  description: "",
  type: "DIGITAL",
  price: "",
  currency: "USD",
  sku: "",
  stockQty: "",
  status: "DRAFT",
  categoryIds: [],
  imageUrls: "",
};

/**
 * Parses a typed amount into minor units.
 *
 * `Math.round(Number(x) * 100)` alone is not safe: 19.99 * 100 is
 * 1998.9999999999998 in binary floating point, and truncating anywhere in the
 * chain sells the product a cent cheap. Rounding after the multiply is what
 * makes it land on 1999.
 *
 * Returns null for anything that is not a usable amount, so the caller can
 * refuse rather than send NaN.
 */
export function parsePriceToCents(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  // Rejects "12abc", "1e5" and other things Number() would happily accept or
  // silently coerce.
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;

  const cents = Math.round(Number(trimmed) * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

/** The inverse, for populating the form from a stored product. */
export function formatCentsForInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

export interface ProductPayload {
  title: string;
  description: string;
  type: string;
  priceCents: number;
  currency: string;
  slug?: string;
  sku?: string;
  stockQty?: number;
  status?: string;
  categoryIds?: string[];
  images?: { url: string; position: number }[];
}

export class ProductFormError extends Error {}

/**
 * Builds the request body.
 *
 * Optional fields are omitted rather than sent empty: the API treats an
 * absent slug as "generate one from the title", while an empty string would
 * fail its pattern check.
 */
export function toProductPayload(values: ProductFormValues, isCreate: boolean): ProductPayload {
  const priceCents = parsePriceToCents(values.price);
  if (priceCents === null) {
    throw new ProductFormError("Enter a price like 19.99");
  }

  const stock = values.stockQty.trim();
  if (stock !== "" && !/^\d+$/.test(stock)) {
    throw new ProductFormError("Stock must be a whole number, or blank for unlimited");
  }

  const images = values.imageUrls
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((url, position) => ({ url, position }));

  const payload: ProductPayload = {
    title: values.title.trim(),
    description: values.description.trim(),
    type: values.type,
    priceCents,
    currency: values.currency.trim().toUpperCase(),
  };

  if (values.slug.trim()) payload.slug = values.slug.trim();
  if (values.sku.trim()) payload.sku = values.sku.trim();
  if (stock !== "") payload.stockQty = Number(stock);
  if (values.categoryIds.length > 0) payload.categoryIds = values.categoryIds;
  if (images.length > 0) payload.images = images;
  // Status is settable only on update — the API always creates as DRAFT, and
  // sending it on create would imply otherwise.
  if (!isCreate) payload.status = values.status;

  return payload;
}
