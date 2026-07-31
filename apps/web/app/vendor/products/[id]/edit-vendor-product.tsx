"use client";

import Link from "next/link";
import { formatCentsForInput, type ProductFormValues } from "@/lib/product-form";
import { useAdminProduct } from "@/lib/use-catalog-admin";
import { ProductForm } from "@/app/admin/products/product-form";

export function EditVendorProduct({ id }: { id: string }) {
  // Scoped to the vendor endpoints: another vendor's id returns a plain 404
  // from the server rather than revealing that the product exists.
  const { data: product, isLoading, error } = useAdminProduct(id, "vendor");

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
      {product.status === "PUBLISHED" && (
        <Link
          href={`/products/${product.slug}`}
          className="text-sm text-brand-600 hover:underline dark:text-brand-400"
        >
          View in shop
        </Link>
      )}
      <ProductForm productId={product.id} initialValues={initialValues} scope="vendor" />
    </div>
  );
}
