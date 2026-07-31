"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api";
import {
  emptyProductForm,
  PRODUCT_STATUSES,
  PRODUCT_TYPES,
  ProductFormError,
  toProductPayload,
  type ProductFormValues,
} from "@/lib/product-form";
import { ImageUploader } from "./image-uploader";
import { ProductFiles } from "./product-files";
import {
  flattenCategories,
  useAdminCategories,
  useCreateProduct,
  useUpdateProduct,
  type CatalogScope,
} from "@/lib/use-catalog-admin";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900";

export function ProductForm({
  productId,
  initialValues,
  scope = "admin",
}: {
  productId?: string;
  initialValues?: ProductFormValues;
  /** Vendors post to their own endpoints, which scope every write to them. */
  scope?: CatalogScope;
}) {
  const router = useRouter();
  const isCreate = !productId;
  const basePath = scope === "vendor" ? "/vendor/products" : "/admin/products";

  const [values, setValues] = useState<ProductFormValues>(initialValues ?? emptyProductForm);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const { data: categoryTree } = useAdminCategories();
  const create = useCreateProduct(scope);
  const update = useUpdateProduct(scope);
  const pending = create.isPending || update.isPending;

  const categoryOptions = flattenCategories(categoryTree);

  function set<K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);

    let payload;
    try {
      payload = toProductPayload(values, isCreate);
    } catch (err) {
      // Thrown by the payload builder for a price or stock it cannot use.
      setError(err instanceof ProductFormError ? err.message : "Check the form and try again.");
      return;
    }

    try {
      if (isCreate) {
        const created = await create.mutateAsync(payload);
        // Straight to the edit screen: a new product is a DRAFT, and
        // publishing it is the next thing anyone wants to do.
        router.push(`${basePath}/${created.id}`);
        return;
      }
      await update.mutateAsync({ id: productId, payload });
      setSaved(true);
    } catch (err) {
      // The API explains duplicate slugs and SKUs precisely; its wording
      // beats anything invented here.
      setError(err instanceof ApiError ? err.message : "Couldn't save that product.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          Saved.
        </p>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <label htmlFor="pf-title" className="block text-sm font-medium">Title</label>
          <input
            id="pf-title"
            required
            value={values.title}
            onChange={(e) => set("title", e.target.value)}
            className={`mt-1.5 ${inputClass}`}
          />
        </div>

        <div className="lg:col-span-2">
          <label htmlFor="pf-description" className="block text-sm font-medium">Description</label>
          <textarea
            id="pf-description"
            required
            rows={5}
            value={values.description}
            onChange={(e) => set("description", e.target.value)}
            className={`mt-1.5 ${inputClass}`}
          />
        </div>

        <div>
          <label htmlFor="pf-type" className="block text-sm font-medium">Type</label>
          <select
            id="pf-type"
            value={values.type}
            onChange={(e) => set("type", e.target.value)}
            className={`mt-1.5 ${inputClass}`}
          >
            {PRODUCT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type.toLowerCase().replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="pf-slug" className="block text-sm font-medium">Slug</label>
          <input
            id="pf-slug"
            value={values.slug}
            onChange={(e) => set("slug", e.target.value)}
            placeholder="Generated from the title if left blank"
            className={`mt-1.5 ${inputClass}`}
          />
          <p className="mt-1 text-xs text-slate-500">
            Lowercase words separated by hyphens. Changing it on a live product breaks existing links.
          </p>
        </div>

        <div>
          <label htmlFor="pf-price" className="block text-sm font-medium">Price</label>
          <input
            id="pf-price"
            required
            inputMode="decimal"
            value={values.price}
            onChange={(e) => set("price", e.target.value)}
            placeholder="19.99"
            className={`mt-1.5 ${inputClass}`}
          />
        </div>

        <div>
          <label htmlFor="pf-currency" className="block text-sm font-medium">Currency</label>
          <input
            id="pf-currency"
            required
            maxLength={3}
            value={values.currency}
            onChange={(e) => set("currency", e.target.value)}
            className={`mt-1.5 ${inputClass}`}
          />
          <p className="mt-1 text-xs text-slate-500">
            Three-letter code. A cart may not mix currencies, so this decides who can buy it alongside what.
          </p>
        </div>

        <div>
          <label htmlFor="pf-sku" className="block text-sm font-medium">SKU</label>
          <input
            id="pf-sku"
            value={values.sku}
            onChange={(e) => set("sku", e.target.value)}
            className={`mt-1.5 ${inputClass}`}
          />
        </div>

        <div>
          <label htmlFor="pf-stock" className="block text-sm font-medium">Stock</label>
          <input
            id="pf-stock"
            inputMode="numeric"
            value={values.stockQty}
            onChange={(e) => set("stockQty", e.target.value)}
            placeholder="Blank = unlimited"
            className={`mt-1.5 ${inputClass}`}
          />
          <p className="mt-1 text-xs text-slate-500">
            Leave blank for digital goods. Zero means out of stock and blocks checkout.
          </p>
        </div>

        {!isCreate && (
          <div>
            <label htmlFor="pf-status" className="block text-sm font-medium">Status</label>
            <select
              id="pf-status"
              value={values.status}
              onChange={(e) => set("status", e.target.value)}
              className={`mt-1.5 ${inputClass}`}
            >
              {PRODUCT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status.toLowerCase()}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Only published products appear in the shop.
            </p>
          </div>
        )}

        <div className="lg:col-span-2">
          <label htmlFor="pf-categories" className="block text-sm font-medium">Categories</label>
          <select
            id="pf-categories"
            multiple
            size={Math.min(6, Math.max(3, categoryOptions.length))}
            value={values.categoryIds}
            onChange={(e) =>
              set(
                "categoryIds",
                Array.from(e.target.selectedOptions).map((option) => option.value),
              )
            }
            className={`mt-1.5 ${inputClass}`}
          >
            {categoryOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          {categoryOptions.length === 0 && (
            <p className="mt-1 text-xs text-slate-500">
              {scope === "vendor"
                ? "No categories are available yet. Ask an administrator to add some."
                : "No categories yet — create some under Categories first."}
            </p>
          )}
        </div>

        <div className="lg:col-span-2">
          <label htmlFor="pf-images" className="block text-sm font-medium">Image URLs</label>
          <textarea
            id="pf-images"
            rows={3}
            value={values.imageUrls}
            onChange={(e) => set("imageUrls", e.target.value)}
            placeholder={"https://example.com/cover.jpg\nhttps://example.com/back.jpg"}
            className={`mt-1.5 ${inputClass}`}
          />
          <ImageUploader
            onUploaded={(url) =>
              // Appended rather than replacing: hand-typed URLs for imagery
              // hosted elsewhere keep working alongside uploads.
              setValues((current) => ({
                ...current,
                imageUrls: current.imageUrls ? `${current.imageUrls}
${url}` : url,
              }))
            }
          />
          <p className="mt-1 text-xs text-slate-500">
            One per line; the first is the one shown in listings. Upload above, or paste URLs of
            images already hosted somewhere.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-gradient px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Saving…" : isCreate ? "Create product" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={() => router.push(basePath)}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium transition hover:border-brand-400 dark:border-slate-700"
        >
          Back to products
        </button>
      </div>

      {isCreate && (
        <p className="text-xs text-slate-500">
          New products are created as drafts and stay invisible in the shop until you publish them.
        </p>
      )}

      {/* Only when editing: a file needs a product to hang off. Staff only —
          the vendor file endpoints are not built yet, so showing this to a
          vendor would offer a control that 403s. */}
      {!isCreate && productId && scope === "admin" && <ProductFiles productId={productId} />}
    </form>
  );
}
