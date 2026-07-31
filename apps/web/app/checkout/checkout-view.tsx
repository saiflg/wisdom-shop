"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { formatPrice } from "@/lib/catalog";
import { useAddresses, useCheckoutPreview, usePlaceOrder, usePreviewCoupon, type CouponPreview } from "@/lib/use-checkout";
import { useAuthStore } from "@/store/auth-store";
import { AddressForm } from "./address-form";

export function CheckoutView() {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const { data: preview, isLoading, error } = useCheckoutPreview();
  const { data: addresses } = useAddresses();
  const placeOrder = usePlaceOrder();
  const previewCoupon = usePreviewCoupon();

  const [couponCode, setCouponCode] = useState("");
  const [coupon, setCoupon] = useState<CouponPreview | null>(null);

  const [addressId, setAddressId] = useState<string>("");
  const [showNewAddress, setShowNewAddress] = useState(false);
  const [priceChanged, setPriceChanged] = useState<string | null>(null);

  // Preselect the user's default address once addresses load.
  useEffect(() => {
    if (addressId || !addresses) return;
    const preferred = addresses.find((a) => a.isDefault) ?? addresses[0];
    if (preferred) setAddressId(preferred.id);
  }, [addresses, addressId]);

  if (status === "idle" || status === "loading") {
    return <p className="mt-8 text-sm text-slate-600 dark:text-slate-400">Loading…</p>;
  }

  if (status !== "authenticated") {
    return (
      <div className="mt-8 rounded-2xl border border-dashed border-slate-300 p-12 text-center dark:border-slate-700">
        <p className="font-medium">Sign in to check out</p>
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
    return <p className="mt-8 text-sm text-slate-600 dark:text-slate-400">Loading your order…</p>;
  }

  // An empty cart surfaces here as a 400 from the preview endpoint.
  if (error) {
    const isEmpty = error instanceof ApiError && error.status === 400;
    return (
      <div className="mt-8 rounded-2xl border border-dashed border-slate-300 p-12 text-center dark:border-slate-700">
        <p className="font-medium">{isEmpty ? "Your cart is empty" : `Couldn't load checkout: ${error.message}`}</p>
        <Link
          href="/products"
          className="mt-4 inline-block rounded-full bg-brand-gradient px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Browse the shop
        </Link>
      </div>
    );
  }

  if (!preview) return null;

  const needsAddress = preview.requiresShipping && !addressId;

  // The server recomputes all of this; these values only decide what the
  // customer is shown and what the expected-total guard is checked against.
  const discountCents = coupon?.valid ? (coupon.discountCents ?? 0) : 0;
  const discountedTotalCents = Math.max(0, preview.totalCents - discountCents);

  async function applyCoupon(event: React.FormEvent) {
    event.preventDefault();
    const code = couponCode.trim();
    if (!code) return;
    const result = await previewCoupon.mutateAsync({ code, subtotalCents: preview!.subtotalCents });
    setCoupon(result);
  }

  async function handlePlaceOrder() {
    setPriceChanged(null);
    try {
      const order = await placeOrder.mutateAsync({
        ...(addressId ? { addressId } : {}),
        ...(coupon?.valid ? { couponCode: coupon.code } : {}),
        // The discounted figure, so the guard compares against what the
        // customer actually saw.
        expectedTotalCents: discountedTotalCents,
      });
      router.push(`/orders/${order.orderNumber}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Either prices moved or stock ran out — both mean "re-read and retry".
        setPriceChanged(
          typeof err.message === "string"
            ? err.message
            : "Something changed while you were checking out. Please review and try again.",
        );
      } else {
        setPriceChanged(
          err instanceof ApiError ? err.message : "Couldn't place your order. Please try again.",
        );
      }
    }
  }

  return (
    <div className="mt-8 space-y-8">
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
          Order summary
        </h2>
        <ul className="mt-3 divide-y divide-slate-200 dark:divide-slate-800">
          {preview.items.map((item) => (
            <li key={`${item.productId}-${item.variantId ?? "base"}`} className="flex justify-between py-3 text-sm">
              <span>
                {item.title} <span className="text-slate-500">× {item.quantity}</span>
              </span>
              <span className="font-medium">{formatPrice(item.lineTotalCents, preview.currency)}</span>
            </li>
          ))}
        </ul>

        <dl className="mt-4 space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-600 dark:text-slate-400">Subtotal</dt>
            <dd>{formatPrice(preview.subtotalCents, preview.currency)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-600 dark:text-slate-400">Shipping</dt>
            <dd>{formatPrice(preview.shippingCents, preview.currency)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-600 dark:text-slate-400">Tax</dt>
            <dd>{formatPrice(preview.taxCents, preview.currency)}</dd>
          </div>
          {discountCents > 0 && (
            <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
              <dt>Discount ({coupon?.code})</dt>
              <dd>−{formatPrice(discountCents, preview.currency)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold dark:border-slate-800">
            <dt>Total</dt>
            <dd>{formatPrice(discountedTotalCents, preview.currency)}</dd>
          </div>
        </dl>

        <form onSubmit={applyCoupon} className="mt-4 flex flex-wrap gap-2">
          <label htmlFor="coupon-code" className="sr-only">Coupon code</label>
          <input
            id="coupon-code"
            value={couponCode}
            onChange={(e) => setCouponCode(e.target.value)}
            placeholder="Coupon code"
            className="min-w-[10rem] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900"
          />
          <button
            type="submit"
            disabled={previewCoupon.isPending}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium transition hover:border-brand-400 disabled:opacity-60 dark:border-slate-700"
          >
            {previewCoupon.isPending ? "Checking…" : "Apply"}
          </button>
        </form>

        {coupon && (
          <p
            role="status"
            className={
              coupon.valid
                ? "mt-2 text-sm text-emerald-700 dark:text-emerald-400"
                : "mt-2 text-sm text-red-700 dark:text-red-400"
            }
          >
            {coupon.valid
              ? `${coupon.code} applied.`
              : // The API explains which rule the code failed; that is more
                // useful than "invalid coupon".
                coupon.message}
          </p>
        )}
      </section>

      {preview.requiresShipping && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
            Shipping address
          </h2>

          {addresses && addresses.length > 0 && (
            <div className="mt-3 space-y-2">
              {addresses.map((address) => (
                <label
                  key={address.id}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800"
                >
                  <input
                    type="radio"
                    name="address"
                    value={address.id}
                    checked={addressId === address.id}
                    onChange={() => setAddressId(address.id)}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium">{address.fullName}</span>
                    <br />
                    {address.line1}
                    {address.line2 ? `, ${address.line2}` : ""}
                    <br />
                    {address.city}
                    {address.state ? `, ${address.state}` : ""} {address.postalCode ?? ""} {address.country}
                    <br />
                    <span className="text-slate-500">{address.phone}</span>
                  </span>
                </label>
              ))}
            </div>
          )}

          {showNewAddress || !addresses || addresses.length === 0 ? (
            <AddressForm
              onSaved={(id) => {
                setAddressId(id);
                setShowNewAddress(false);
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowNewAddress(true)}
              className="mt-3 text-sm text-brand-600 hover:underline dark:text-brand-400"
            >
              Use a different address
            </button>
          )}
        </section>
      )}

      {priceChanged && (
        <p role="alert" className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {priceChanged}
        </p>
      )}

      <div>
        <button
          type="button"
          onClick={handlePlaceOrder}
          disabled={placeOrder.isPending || needsAddress}
          className="w-full rounded-lg bg-brand-gradient px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
        >
          {placeOrder.isPending ? "Placing order…" : "Place order"}
        </button>
        {needsAddress && (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Add a shipping address to continue.
          </p>
        )}
        <p className="mt-3 text-xs text-slate-500">
          Your order will be created as <strong>pending payment</strong>. Online payment is not
          connected yet.
        </p>
      </div>
    </div>
  );
}
