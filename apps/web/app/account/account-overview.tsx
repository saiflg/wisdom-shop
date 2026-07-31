"use client";

import Link from "next/link";
import { RequireAuth } from "@/components/require-auth";
import { useAuthStore } from "@/store/auth-store";
import { useMyLicenses } from "@/lib/use-account";
import { useOrders } from "@/lib/use-checkout";

export function AccountOverview() {
  return (
    <RequireAuth>
      <OverviewContent />
    </RequireAuth>
  );
}

function OverviewContent() {
  const user = useAuthStore((s) => s.user);
  const { data: orders } = useOrders();
  const { data: licenses } = useMyLicenses();

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-200 p-6 dark:border-slate-800">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
          Signed in as
        </h2>
        <p className="mt-2 font-medium">{user?.email}</p>
        {user && user.roles.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {user.roles.map((role) => (
              <span
                key={role}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium dark:border-slate-800"
              >
                {role.toLowerCase().replace(/_/g, " ")}
              </span>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href="/orders"
          className="rounded-2xl border border-slate-200 p-6 transition hover:border-brand-400 dark:border-slate-800"
        >
          <p className="text-3xl font-bold">{orders?.length ?? "—"}</p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {orders?.length === 1 ? "Order" : "Orders"}
          </p>
        </Link>

        <Link
          href="/account/licenses"
          className="rounded-2xl border border-slate-200 p-6 transition hover:border-brand-400 dark:border-slate-800"
        >
          <p className="text-3xl font-bold">{licenses?.length ?? "—"}</p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {licenses?.length === 1 ? "License" : "Licenses"}
          </p>
        </Link>
      </div>
    </div>
  );
}
