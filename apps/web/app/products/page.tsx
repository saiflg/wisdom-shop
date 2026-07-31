import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { ProductCard } from "@/components/product-card";
import { fetchCategoryTree, fetchProducts } from "@/lib/catalog";
import { ProductFilters } from "./product-filters";

export const metadata: Metadata = {
  title: "Shop — Wisdom Shop",
  description: "Browse books, courses, educational software, and equipment.",
};

interface SearchParams {
  page?: string;
  category?: string;
  type?: string;
  search?: string;
  sort?: string;
}

export default async function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const [products, categories] = await Promise.all([
    fetchProducts({
      page: searchParams.page,
      category: searchParams.category,
      type: searchParams.type,
      search: searchParams.search,
      sort: searchParams.sort,
    }),
    fetchCategoryTree(),
  ]);

  const { meta } = products;

  function pageHref(page: number) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (value) params.set(key, value);
    }
    params.set("page", String(page));
    return `/products?${params.toString()}`;
  }

  return (
    <main className="min-h-screen">
      <SiteHeader />

      <section className="mx-auto max-w-7xl px-6 pb-20">
        <h1 className="text-3xl font-bold tracking-tight">Shop</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          {meta.total} {meta.total === 1 ? "product" : "products"} available
        </p>

        <div className="mt-8">
          <ProductFilters categories={categories} />
        </div>

        {products.data.length === 0 ? (
          <div className="mt-12 rounded-2xl border border-dashed border-slate-300 p-12 text-center dark:border-slate-700">
            <p className="font-medium">No products match those filters.</p>
            <Link href="/products" className="mt-2 inline-block text-sm text-brand-600 hover:underline dark:text-brand-400">
              Clear all filters
            </Link>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {products.data.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}

        {meta.totalPages > 1 && (
          <nav className="mt-10 flex items-center justify-center gap-3" aria-label="Pagination">
            {meta.page > 1 && (
              <Link
                href={pageHref(meta.page - 1)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium transition hover:border-brand-400 dark:border-slate-700"
              >
                Previous
              </Link>
            )}
            <span className="text-sm text-slate-600 dark:text-slate-400">
              Page {meta.page} of {meta.totalPages}
            </span>
            {meta.page < meta.totalPages && (
              <Link
                href={pageHref(meta.page + 1)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium transition hover:border-brand-400 dark:border-slate-700"
              >
                Next
              </Link>
            )}
          </nav>
        )}
      </section>
    </main>
  );
}
