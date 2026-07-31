import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { AddToCart } from "@/components/add-to-cart";
import { ProductReviews } from "@/components/product-reviews";
import { fetchProductBySlug, formatPrice, formatProductType } from "@/lib/catalog";

interface PageProps {
  params: { slug: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const product = await fetchProductBySlug(params.slug);
  if (!product) return { title: "Product not found — Wisdom Shop" };

  return {
    title: `${product.title} — Wisdom Shop`,
    description: product.description.slice(0, 160),
    openGraph: {
      title: product.title,
      description: product.description.slice(0, 160),
      type: "website",
      images: product.images[0] ? [{ url: product.images[0].url }] : undefined,
    },
  };
}

export default async function ProductDetailPage({ params }: PageProps) {
  const product = await fetchProductBySlug(params.slug);
  if (!product) notFound();

  const image = product.images[0];
  const inStock = product.stockQty === null || product.stockQty > 0;

  // Schema.org Product markup for search-result rich snippets.
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.description,
    sku: product.sku ?? undefined,
    image: product.images.map((img) => img.url),
    offers: {
      "@type": "Offer",
      price: (product.priceCents / 100).toFixed(2),
      priceCurrency: product.currency,
      availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
  };

  return (
    <main className="min-h-screen">
      <SiteHeader />

      <script
        type="application/ld+json"
        // Serialized server-side from our own API data, not user input.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <div className="mx-auto max-w-7xl px-6 pb-20">
        <nav className="mb-8 text-sm text-slate-600 dark:text-slate-400" aria-label="Breadcrumb">
          <Link href="/products" className="hover:underline">
            Shop
          </Link>
          <span className="mx-2">/</span>
          <span className="text-slate-900 dark:text-slate-100">{product.title}</span>
        </nav>

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-slate-100 dark:bg-slate-800">
            {image ? (
              <Image
                src={image.url}
                alt={image.altText ?? product.title}
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
                priority
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">No image</div>
            )}
          </div>

          <div>
            <span className="text-xs font-medium uppercase tracking-wide text-brand-600 dark:text-brand-400">
              {formatProductType(product.type)}
            </span>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">{product.title}</h1>

            <p className="mt-4 text-3xl font-semibold">
              {formatPrice(product.priceCents, product.currency)}
            </p>

            <p className="mt-1 text-sm">
              {inStock ? (
                <span className="text-green-700 dark:text-green-400">In stock</span>
              ) : (
                <span className="text-red-700 dark:text-red-400">Out of stock</span>
              )}
              {product.stockQty !== null && inStock && (
                <span className="text-slate-600 dark:text-slate-400"> · {product.stockQty} available</span>
              )}
            </p>

            <AddToCart
              productId={product.id}
              currency={product.currency}
              variants={product.variants}
              inStock={inStock}
            />

            <div className="mt-6 border-t border-slate-200 pt-6 dark:border-slate-800">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                Description
              </h2>
              <p className="mt-2 leading-relaxed text-slate-700 dark:text-slate-300">{product.description}</p>
            </div>

            {product.categories.length > 0 && (
              <div className="mt-6 border-t border-slate-200 pt-6 dark:border-slate-800">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                  Categories
                </h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {product.categories.map(({ category }) => (
                    <Link
                      key={category.id}
                      href={`/products?category=${category.slug}`}
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium transition hover:border-brand-400 dark:border-slate-800"
                    >
                      {category.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Client component: reviews depend on who is signed in, while the
            rest of this page is server-rendered from the public product. */}
        <ProductReviews slug={product.slug} />
      </div>
    </main>
  );
}
