"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/store/auth-store";
import { useIsStaff } from "@/lib/use-admin";

const LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/vendors", label: "Vendors" },
  { href: "/admin/users", label: "Users" },
  // Shown to all staff; the page itself refuses anyone who is not a super
  // admin, matching the server. Hiding the link entirely would leave a super
  // admin wondering where the settings went if their roles were misread.
  { href: "/admin/settings", label: "Settings" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav
      className="mb-8 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden"
      aria-label="Admin"
    >
      {LINKS.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "whitespace-nowrap rounded-full bg-brand-gradient px-4 py-1.5 text-sm font-medium text-white"
                : "whitespace-nowrap rounded-full border border-slate-200 px-4 py-1.5 text-sm font-medium transition hover:border-brand-400 dark:border-slate-800"
            }
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Hides admin screens from non-staff. Like `RequireAuth`, this is a UX guard
 * rather than a security boundary — every admin endpoint is role-gated
 * server-side, so a determined user who renders these screens sees 403s and
 * empty tables, not data.
 */
export function RequireStaff({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const isStaff = useIsStaff();

  if (status === "idle" || status === "loading") {
    return <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>;
  }

  if (status !== "authenticated") {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 p-12 text-center dark:border-slate-700">
        <p className="font-medium">Sign in to continue</p>
        <Link
          href="/login"
          className="mt-4 inline-block rounded-full bg-brand-gradient px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Sign in
        </Link>
      </div>
    );
  }

  if (!isStaff) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 p-12 text-center dark:border-slate-700">
        <p className="font-medium">You don&apos;t have access to the admin area</p>
        <Link href="/" className="mt-2 inline-block text-sm text-brand-600 hover:underline dark:text-brand-400">
          Back to the shop
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
