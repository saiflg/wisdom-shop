"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useMyVendor } from "@/lib/use-vendor";
import { RequireAuth } from "@/components/require-auth";

const LINKS = [
  { href: "/vendor", label: "Overview" },
  { href: "/vendor/products", label: "Products" },
  { href: "/vendor/earnings", label: "Earnings" },
];

export function VendorNav() {
  const pathname = usePathname();
  return (
    <nav
      className="mb-8 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden"
      aria-label="Vendor"
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

function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
      <p className="font-medium">{title}</p>
      <div className="mx-auto mt-2 max-w-prose text-sm text-slate-600 dark:text-slate-400">{children}</div>
    </div>
  );
}

/**
 * Gates the vendor area on the *vendor account's status*, not on the VENDOR
 * role.
 *
 * The two can disagree in the moment — the API revokes the role when an
 * account is suspended, but a token minted beforehand still carries it. The
 * server checks status on every vendor route (`requireApprovedVendorId`), so
 * gating on anything else here would show screens whose every request 403s.
 *
 * Each non-approved state gets its own explanation rather than one generic
 * refusal: "we are still reviewing you" and "you have been suspended" call
 * for completely different responses from the reader.
 *
 * `children` is a plain node, not a render prop taking the vendor. The pages
 * that use this are Server Components, and React cannot serialise a function
 * across the server/client boundary — a render prop builds fine and fails at
 * static generation. Anything needing the vendor record calls `useMyVendor()`
 * itself; react-query serves it from the same cache entry.
 */
export function RequireApprovedVendor({ children }: { children: ReactNode }) {
  const { data: vendor, isLoading, error } = useMyVendor();

  return (
    <RequireAuth>
      {isLoading && <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>}

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          Couldn&apos;t load your vendor account: {error.message}
        </p>
      )}

      {!isLoading && !error && vendor === null && (
        <Notice title="You don't have a vendor account yet">
          <p>
            Apply from the{" "}
            <Link href="/vendor" className="text-brand-600 hover:underline dark:text-brand-400">
              vendor overview
            </Link>{" "}
            to start selling on Wisdom Shop.
          </p>
        </Notice>
      )}

      {vendor && vendor.status === "PENDING" && (
        <Notice title="Your application is still being reviewed">
          <p>
            You applied as <strong>{vendor.storeName}</strong>. You&apos;ll be emailed when it is
            approved, and this area will open up then.
          </p>
        </Notice>
      )}

      {vendor && vendor.status === "SUSPENDED" && (
        <Notice title="Your vendor account is suspended">
          <p>
            Your products have been withdrawn from the shop. Contact support if you think this is a
            mistake.
          </p>
        </Notice>
      )}

      {vendor && vendor.status === "REJECTED" && (
        <Notice title="Your vendor application was not approved">
          <p>Contact support if you would like to discuss it.</p>
        </Notice>
      )}

      {vendor && vendor.status === "APPROVED" && children}
    </RequireAuth>
  );
}
