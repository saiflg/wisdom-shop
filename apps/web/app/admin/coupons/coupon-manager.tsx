"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiError } from "@/lib/api";
import { formatPrice } from "@/lib/catalog";
import { useAuthStore } from "@/store/auth-store";

interface Coupon {
  id: string;
  code: string;
  percentOff: number | null;
  amountOffCents: number | null;
  minSubtotalCents: number | null;
  maxRedemptions: number | null;
  redeemedCount: number;
  expiresAt: string | null;
  active: boolean;
}

const COUPONS_KEY = ["admin-coupons"];

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900";

export function CouponManager() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  // Built as an explicit Record so the empty case is still Record<string,string>;
  // an inline ternary produces a union TS rejects as HeadersInit.
  const headers: Record<string, string> = accessToken
    ? { Authorization: `Bearer ${accessToken}` }
    : {};

  const { data, isLoading, error } = useQuery({
    queryKey: COUPONS_KEY,
    enabled: Boolean(accessToken),
    queryFn: () => apiFetch<Coupon[]>("/v1/admin/coupons", { headers }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: COUPONS_KEY });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<Coupon>("/v1/admin/coupons", { method: "POST", headers, body }),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string; active?: boolean }) =>
      apiFetch<Coupon>(`/v1/admin/coupons/${id}`, { method: "PATCH", headers, body }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/v1/admin/coupons/${id}`, { method: "DELETE", headers }),
    onSuccess: invalidate,
  });

  const [form, setForm] = useState({
    code: "",
    kind: "percent" as "percent" | "amount",
    percentOff: "10",
    amountOff: "5.00",
    minSubtotal: "",
    maxRedemptions: "",
    expiresAt: "",
  });
  const [actionError, setActionError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setActionError(null);
    try {
      await fn();
    } catch (err) {
      // The API explains duplicates, misconfiguration, and refusing to
      // delete a coupon that is already on an order.
      setActionError(err instanceof ApiError ? err.message : "That change was refused.");
    }
  }

  function toMinor(value: string): number | undefined {
    const trimmed = value.trim();
    if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return undefined;
    return Math.round(Number(trimmed) * 100);
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const body: Record<string, unknown> = { code: form.code };

    if (form.kind === "percent") {
      body.percentOff = Number(form.percentOff);
    } else {
      const amount = toMinor(form.amountOff);
      if (amount === undefined) {
        setActionError("Enter a fixed amount like 5.00");
        return;
      }
      body.amountOffCents = amount;
    }

    if (form.minSubtotal.trim()) {
      const min = toMinor(form.minSubtotal);
      if (min === undefined) {
        setActionError("Enter a minimum spend like 25.00");
        return;
      }
      body.minSubtotalCents = min;
    }
    if (form.maxRedemptions.trim()) body.maxRedemptions = Number(form.maxRedemptions);
    if (form.expiresAt.trim()) body.expiresAt = new Date(form.expiresAt).toISOString();

    await run(async () => {
      await create.mutateAsync(body);
      setForm({ ...form, code: "", minSubtotal: "", maxRedemptions: "", expiresAt: "" });
    });
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleCreate} className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
        <h2 className="text-lg font-semibold">Create a coupon</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          A coupon is either a percentage or a fixed amount, never both. Codes are matched
          case-insensitively.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="c-code" className="block text-sm font-medium">Code</label>
            <input
              id="c-code"
              required
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="SAVE10"
              className={`mt-1.5 w-full ${inputClass}`}
            />
          </div>

          <div>
            <label htmlFor="c-kind" className="block text-sm font-medium">Discount type</label>
            <select
              id="c-kind"
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as "percent" | "amount" })}
              className={`mt-1.5 w-full ${inputClass}`}
            >
              <option value="percent">Percentage off</option>
              <option value="amount">Fixed amount off</option>
            </select>
          </div>

          {form.kind === "percent" ? (
            <div>
              <label htmlFor="c-percent" className="block text-sm font-medium">Percent off</label>
              <input
                id="c-percent"
                type="number"
                min={1}
                max={100}
                value={form.percentOff}
                onChange={(e) => setForm({ ...form, percentOff: e.target.value })}
                className={`mt-1.5 w-full ${inputClass}`}
              />
            </div>
          ) : (
            <div>
              <label htmlFor="c-amount" className="block text-sm font-medium">Amount off</label>
              <input
                id="c-amount"
                inputMode="decimal"
                value={form.amountOff}
                onChange={(e) => setForm({ ...form, amountOff: e.target.value })}
                className={`mt-1.5 w-full ${inputClass}`}
              />
              <p className="mt-1 text-xs text-slate-500">
                Never takes off more than the order is worth.
              </p>
            </div>
          )}

          <div>
            <label htmlFor="c-min" className="block text-sm font-medium">Minimum spend (optional)</label>
            <input
              id="c-min"
              inputMode="decimal"
              value={form.minSubtotal}
              onChange={(e) => setForm({ ...form, minSubtotal: e.target.value })}
              placeholder="25.00"
              className={`mt-1.5 w-full ${inputClass}`}
            />
          </div>

          <div>
            <label htmlFor="c-max" className="block text-sm font-medium">Redemption limit (optional)</label>
            <input
              id="c-max"
              type="number"
              min={1}
              value={form.maxRedemptions}
              onChange={(e) => setForm({ ...form, maxRedemptions: e.target.value })}
              placeholder="Unlimited"
              className={`mt-1.5 w-full ${inputClass}`}
            />
          </div>

          <div>
            <label htmlFor="c-expires" className="block text-sm font-medium">Expires (optional)</label>
            <input
              id="c-expires"
              type="date"
              value={form.expiresAt}
              onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
              className={`mt-1.5 w-full ${inputClass}`}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={create.isPending}
          className="mt-5 rounded-lg bg-brand-gradient px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
        >
          {create.isPending ? "Creating…" : "Create coupon"}
        </button>
      </form>

      {actionError && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {actionError}
        </p>
      )}

      {isLoading && <p className="text-sm text-slate-600 dark:text-slate-400">Loading coupons…</p>}

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          Couldn&apos;t load coupons: {error.message}
        </p>
      )}

      {data && data.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-700">
          <p className="font-medium">No coupons yet</p>
        </div>
      )}

      {data && data.length > 0 && (
        <ul className="space-y-3">
          {data.map((coupon) => (
            <li key={coupon.id} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono font-medium">{coupon.code}</p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    {coupon.percentOff !== null
                      ? `${coupon.percentOff}% off`
                      : `${formatPrice(coupon.amountOffCents ?? 0, "USD")} off`}
                    {coupon.minSubtotalCents !== null &&
                      ` · min ${formatPrice(coupon.minSubtotalCents, "USD")}`}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Redeemed {coupon.redeemedCount}
                    {coupon.maxRedemptions !== null ? ` of ${coupon.maxRedemptions}` : " times"}
                    {coupon.expiresAt &&
                      ` · expires ${new Date(coupon.expiresAt).toLocaleDateString()}`}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                    coupon.active
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                      : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-400"
                  }`}
                >
                  {coupon.active ? "active" : "inactive"}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => run(() => update.mutateAsync({ id: coupon.id, active: !coupon.active }))}
                  disabled={update.isPending}
                  className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium transition hover:border-brand-400 disabled:opacity-60 dark:border-slate-700"
                >
                  {coupon.active ? "Deactivate" : "Reactivate"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!window.confirm(`Delete "${coupon.code}"?`)) return;
                    void run(() => remove.mutateAsync(coupon.id));
                  }}
                  disabled={remove.isPending}
                  className="rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-700 transition hover:border-red-400 disabled:opacity-60 dark:border-red-900 dark:text-red-400"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
