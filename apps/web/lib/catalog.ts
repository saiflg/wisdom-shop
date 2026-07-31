/** Server-side catalog fetching. Runs on the Next server, so it talks to the API directly. */

const API_URL = process.env.API_URL ?? "http://localhost:4000";

export interface ProductImage {
  id: string;
  url: string;
  altText: string | null;
  position: number;
}

export interface ProductVariant {
  id: string;
  name: string;
  priceCents: number;
  sku: string | null;
  stockQty: number | null;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
}

export interface CategoryNode extends Category {
  children: CategoryNode[];
}

export interface Product {
  id: string;
  title: string;
  slug: string;
  description: string;
  type: string;
  status: string;
  priceCents: number;
  currency: string;
  sku: string | null;
  stockQty: number | null;
  metadata: Record<string, unknown> | null;
  images: ProductImage[];
  variants: ProductVariant[];
  categories: { category: Category }[];
}

export interface PaginatedProducts {
  data: Product[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export function formatPrice(priceCents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(priceCents / 100);
}

export function formatProductType(type: string): string {
  return type
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export async function fetchProducts(searchParams: Record<string, string | undefined>): Promise<PaginatedProducts> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value) query.set(key, value);
  }

  const res = await fetch(`${API_URL}/v1/products?${query.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load products (${res.status})`);
  return res.json();
}

export async function fetchProductBySlug(slug: string): Promise<Product | null> {
  const res = await fetch(`${API_URL}/v1/products/${encodeURIComponent(slug)}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load product (${res.status})`);
  return res.json();
}

export async function fetchCategoryTree(): Promise<CategoryNode[]> {
  const res = await fetch(`${API_URL}/v1/categories`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load categories (${res.status})`);
  return res.json();
}
