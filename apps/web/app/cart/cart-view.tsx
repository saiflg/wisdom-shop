"use client";

import Image from "next/image";
import Link from "next/link";
import { formatPrice } from "@/lib/catalog";
import { useCart, useRemoveCartItem, useUpdateCartItem } from "@/lib/use-cart";
import { useAuthStore } from "@/store/auth-store";
import type { CartLine } from "@/lib/cart-types";

function CartRow({ line, currency }: { line: CartLine; currency: string }) {
  const updateItem = useUpdateCartItem();
  const removeItem = useRemoveCartItem();
  const busy = updateItem.isPending || removeItem.isPending;

  const atStockLimit = line.availableStock !== null && line.quantity >= line.availableStock;

  return (
    <li className="flex gap-4 border-b border-slate-200 py-5 dark:border-slate-800">
      <Link
        href={`/products/${line.slug}`}
        className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800"
      >
        {line.imageUrl ? (
          <Image src={line.imageUrl} alt={line.title} fill sizes="96px" className="object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center text-xs text-slate-400">No image</span>
        )}
      </Link>

      <div className="flex flex-1 flex-col">
        <Link href={`/products/${line.slug}`} className="font-medium hover:underline">
          {line.title}
        </Link>
        {line.variantName && (
          <span className="text-sm text-slate-600 dark:text-slate-400">{line.variantName}</span>
        )}
        <span className="text-sm text-slate-600 dark:text-slate-400">
          {formatPrice(line.unitPriceCents, currency)} each
        </span>

        <div className="mt-auto flex items-center gap-2 pt-2">
          <button
            type="button"
            aria-label={`Decrease quantity of ${line.title}`}
            disabled={busy || line.quantity <= 1}
            onClick={() => updateItem.mutate({ itemId: line.id, quantity: line.quantity - 1 })}
            className="h-8 w-8 rounded-md border border-slate-300 text-sm transition hover:border-brand-400 disabled:opacity-40 dark:border-slate-700"
          >
            −
          </button>
          <span className="w-10 text-center text-sm font-medium" aria-live="polite">
            {line.quantity}
          </span>
          <button
            type="button"
            aria-label={`Increase quantity of ${line.title}`}
            disabled={busy || atStockLimit}
            onClick={() => updateItem.mutate({ itemId: line.id, quantity: line.quantity + 1 })}
            className="h-8 w-8 rounded-md border border-slate-300 text-sm transition hover:border-brand-400 disabled:opacity-40 dark:border-slate-700"
          >
            +
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => removeItem.mutate({ itemId: line.id })}
            className="ml-3 text-sm text-red-600 hover:underline disabled:opacity-40 dark:text-red-400"
          >
            Remove
          </button>
        </div>

        {atStockLimit && (
          <p className="pt-1 text-xs text-slate-500">
            Only {line.availableStock} available
          </p>
        )}
        {(updateItem.error || removeItem.error) && (
          <p role="alert" className="pt-1 text-xs text-red-600 dark:text-red-400">
            {(updateItem.error ?? removeItem.error)?.message}
          </p>
        )}
      </div>

      <div className="shrink-0 text-right font-semibold">
        {formatPrice(line.lineTotalCents, currency)}
      </div>
    </li>
  );
}

export function CartView() {
  const status = useAuthStore((s) => s.status);
  const { data: cart, isLoading, error } = useCart();

  if (status === "idle" || status === "loading") {
    return <p className="mt-8 text-sm text-slate-600 dark:text-slate-400">Loading…</p>;
  }

  if (status !== "authenticated") {
    return (
      <div className="mt-8 rounded-2xl border border-dashed border-slate-300 p-12 text-center dark:border-slate-700">
        <p className="font-medium">Sign in to see your cart</p>
        <Link
          href="/login"
          className="mt-4 inline-block rounded-full bg-brand-gradient px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Sign in
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return <p className="mt-8 text-sm text-slate-600 dark:text-slate-400">Loading your cart…</p>;
  }

  if (error) {
    return (
      <p role="alert" className="mt-8 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
        Couldn&apos;t load your cart: {error.message}
      </p>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="mt-8 rounded-2xl border border-dashed border-slate-300 p-12 text-center dark:border-slate-700">
        <p className="font-medium">Your cart is empty</p>
        <Link
          href="/products"
          className="mt-4 inline-block rounded-full bg-brand-gradient px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Browse the shop
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <ul>
        {cart.items.map((line) => (
          <CartRow key={line.id} line={line} currency={cart.currency} />
        ))}
      </ul>

      <div className="mt-6 flex flex-col items-end gap-1">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {cart.itemCount} {cart.itemCount === 1 ? "item" : "items"}
        </p>
        <p className="text-2xl font-bold">
          Subtotal: {formatPrice(cart.subtotalCents, cart.currency)}
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Shipping and taxes are calculated at checkout.
        </p>
        <Link
          href="/checkout"
          className="mt-4 inline-block rounded-lg bg-brand-gradient px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Proceed to checkout
        </Link>
      </div>
    </div>
  );
}
