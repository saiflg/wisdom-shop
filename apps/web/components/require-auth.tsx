"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useAuthStore } from "@/store/auth-store";

/**
 * Gates client-rendered account pages. This is a UX guard, not a security
 * boundary — every underlying endpoint is authenticated server-side, so a
 * user who bypasses this sees an empty shell and 401s, not data.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);

  if (status === "idle" || status === "loading") {
    return <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>;
  }

  if (status !== "authenticated") {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 p-12 text-center dark:border-slate-700">
        <p className="font-medium">Sign in to view your account</p>
        <Link
          href="/login"
          className="mt-4 inline-block rounded-full bg-brand-gradient px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
