"use client";

import Link from "next/link";
import { formatCentsForInput, type ProductFormValues } from "@/lib/product-form";
import { useAdminProduct } from "@/lib/use-catalog-admin";
import { ProductForm } from "../product-form";

export function EditProduct({ id }: { id: string }) {
  const { data: product, isLoading, error } = useAdminProduct(id);

  if (isLoading) return <p className="text-sm text-slate-600 dark:text-slate-400">Loading product…</p>;

  if (error) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
        Couldn&apos;t load that product: {error.message}
      </p>
    );
  }

  if (!product) return null;

  const initialValues: ProductFormValues = {
    title: product.title,
    slug: product.slug,
    description: product.description,
    type: product.type,
    // Back through the same conversion the form submits with, so an
    // untouched edit saves the identical price rather than a rounded one.
    price: formatCentsForInput(product.priceCents),
    currency: product.currency,
    sku: product.sku ?? "",
    stockQty: product.stockQty === null ? "" : String(product.stockQty),
    status: product.status,
    categoryIds: product.categories.map((c) => c.category.id),
    imageUrls: product.images.map((image) => image.url).join("\n"),
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-slate-600 dark:text-slate-400">
          Created {new Date(product.createdAt).toLocaleDateString()}
        </span>
        {product.status === "PUBLISHED" && (
          <Link
            href={`/products/${product.slug}`}
            className="text-brand-600 hover:underline dark:text-brand-400"
          >
            View in shop
          </Link>
        )}
      </div>

      <ProductForm productId={product.id} initialValues={initialValues} />
    </div>
  );
}
