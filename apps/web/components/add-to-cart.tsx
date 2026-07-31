"use client";

import Link from "next/link";
import { useState } from "react";
import { ApiError } from "@/lib/api";
import { useAddToCart } from "@/lib/use-cart";
import { useAuthStore } from "@/store/auth-store";
import { formatPrice } from "@/lib/catalog";
import type { ProductVariant } from "@/lib/catalog";

interface AddToCartProps {
  productId: string;
  currency: string;
  variants: ProductVariant[];
  inStock: boolean;
}

export function AddToCart({ productId, currency, variants, inStock }: AddToCartProps) {
  const status = useAuthStore((s) => s.status);
  const addToCart = useAddToCart();
  const [variantId, setVariantId] = useState<string>(variants[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  if (status === "loading" || status === "idle") {
    return <div className="mt-6 h-12 w-full animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />;
  }

  if (status !== "authenticated") {
    return (
      <div className="mt-6 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          <Link href="/login" className="font-medium text-brand-600 hover:underline dark:text-brand-400">
            Sign in
          </Link>{" "}
          to add this to your cart.
        </p>
      </div>
    );
  }

  if (!inStock) {
    return (
      <p className="mt-6 rounded-lg bg-slate-100 px-4 py-3 text-sm font-medium dark:bg-slate-800">
        Out of stock
      </p>
    );
  }

  async function handleAdd() {
    setMessage(null);
    setAdded(false);
    try {
      await addToCart.mutateAsync({
        productId,
        ...(variantId ? { variantId } : {}),
        quantity,
      });
      setAdded(true);
    } catch (error) {
      setMessage(
        error instanceof ApiError
          ? error.message
          : "Couldn't add that to your cart. Please try again.",
      );
    }
  }

  return (
    <div className="mt-6 space-y-3">
      {variants.length > 0 && (
        <div>
          <label htmlFor="variant" className="mb-1.5 block text-sm font-medium">
            Option
          </label>
          <select
            id="variant"
            value={variantId}
            onChange={(e) => setVariantId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            {variants.map((variant) => (
              <option key={variant.id} value={variant.id}>
                {variant.name} — {formatPrice(variant.priceCents, currency)}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex items-end gap-3">
        <div className="w-24">
          <label htmlFor="quantity" className="mb-1.5 block text-sm font-medium">
            Qty
          </label>
          <input
            id="quantity"
            type="number"
            min={1}
            max={999}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </div>

        <button
          type="button"
          onClick={handleAdd}
          disabled={addToCart.isPending}
          className="flex-1 rounded-lg bg-brand-gradient px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
        >
          {addToCart.isPending ? "Adding…" : "Add to cart"}
        </button>
      </div>

      {added && !message && (
        <p role="status" className="text-sm text-green-700 dark:text-green-400">
          Added to your cart.{" "}
          <Link href="/cart" className="font-medium underline">
            View cart
          </Link>
        </p>
      )}
      {message && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {message}
        </p>
      )}
    </div>
  );
}
