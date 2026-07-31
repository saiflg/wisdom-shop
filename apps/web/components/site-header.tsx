"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import { useIsStaff } from "@/lib/use-admin";
import { useCart, CART_QUERY_KEY } from "@/lib/use-cart";
import { ThemeToggle } from "@/app/theme-toggle";

const CATEGORY_LINKS = [
  { label: "All", href: "/products" },
  { label: "Books", href: "/products?type=DIGITAL" },
  { label: "Courses", href: "/products?type=COURSE" },
  { label: "Software", href: "/products?type=SOFTWARE" },
  { label: "Licences", href: "/products?type=LICENSE" },
  { label: "Equipment", href: "/products?type=PHYSICAL" },
  { label: "Subscriptions", href: "/products?type=SUBSCRIPTION" },
];

function CartIcon({ count }: { count: number }) {
  return (
    <span className="relative inline-flex items-center">
      <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M3 3h2l.4 2M7 13h10l3-8H5.4M7 13 5.4 5M7 13l-.7 3.5h11.4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="9" cy="20" r="1.4" />
        <circle cx="17" cy="20" r="1.4" />
      </svg>
      {count > 0 && (
        <span
          aria-label={`${count} items in cart`}
          className="absolute -right-2 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1 text-xs font-bold text-slate-900"
        >
          {count}
        </span>
      )}
    </span>
  );
}

export function SiteHeader() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, status, clearSession } = useAuthStore();
  const isStaff = useIsStaff();
  const { data: cart } = useCart();

  // Deliberately not seeded from useSearchParams: that hook opts a client
  // component out of static rendering unless it sits inside a Suspense
  // boundary, and this header is on every page. Prefilling the box is not
  // worth making every page dynamic.
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleLogout() {
    try {
      await apiFetch("/v1/auth/logout", { method: "POST", csrf: true });
    } catch {
      // Cookie may already be invalid/expired — clear local state regardless.
    }
    clearSession();
    // Drop the previous user's cart so it can't flash for the next visitor.
    queryClient.removeQueries({ queryKey: CART_QUERY_KEY });
    setMenuOpen(false);
    router.push("/");
    router.refresh();
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = search.trim();
    router.push(trimmed ? `/products?search=${encodeURIComponent(trimmed)}` : "/products");
    setMenuOpen(false);
  }

  const authenticated = status === "authenticated" && user;

  return (
    <header id="top" className="sticky top-0 z-40">
      {/* Primary bar. Dark in both themes by design: it is the constant the
          rest of the page is arranged around, the way a storefront masthead is. */}
      <div className="bg-slate-900 text-white">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 sm:px-6 lg:gap-6">
          <Link href="/" className="shrink-0 text-lg font-bold tracking-tight">
            Wisdom <span className="text-brand-400">Shop</span>
          </Link>

          <form onSubmit={submitSearch} className="hidden flex-1 md:block" role="search">
            <div className="flex overflow-hidden rounded-md">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search books, courses, software and more"
                aria-label="Search products"
                className="w-full bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-500"
              />
              <button
                type="submit"
                className="bg-amber-400 px-4 text-sm font-semibold text-slate-900 transition hover:bg-amber-300"
              >
                Search
              </button>
            </div>
          </form>

          <nav className="ml-auto flex items-center gap-3 lg:gap-5">
            {authenticated ? (
              <div className="hidden items-center gap-5 lg:flex">
                <Link href="/account" className="text-xs leading-tight hover:underline">
                  <span className="block text-slate-300">Hello, {user.email.split("@")[0]}</span>
                  <span className="block font-bold">Account &amp; lists</span>
                </Link>
                <Link href="/orders" className="text-xs leading-tight hover:underline">
                  <span className="block text-slate-300">Returns</span>
                  <span className="block font-bold">&amp; orders</span>
                </Link>
                {isStaff && (
                  <Link href="/admin" className="text-xs leading-tight hover:underline">
                    <span className="block text-slate-300">Manage</span>
                    <span className="block font-bold text-amber-400">Admin</span>
                  </Link>
                )}
                <button type="button" onClick={handleLogout} className="text-sm font-medium hover:underline">
                  Sign out
                </button>
              </div>
            ) : (
              <div className="hidden items-center gap-4 lg:flex">
                <Link href="/login" className="text-xs leading-tight hover:underline">
                  <span className="block text-slate-300">Hello, sign in</span>
                  <span className="block font-bold">Account &amp; lists</span>
                </Link>
                <Link href="/register" className="text-sm font-medium hover:underline">
                  Sign up
                </Link>
              </div>
            )}

            <Link href="/cart" className="flex items-center gap-1.5 hover:underline" aria-label="Cart">
              <CartIcon count={cart?.itemCount ?? 0} />
              <span className="hidden text-sm font-bold sm:inline">Cart</span>
            </Link>

            <ThemeToggle />

            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-label="Menu"
              className="lg:hidden"
            >
              <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
                {menuOpen ? (
                  <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
                ) : (
                  <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
                )}
              </svg>
            </button>
          </nav>
        </div>

        {/* Search moves to its own row rather than disappearing on small
            screens — hiding it would remove the main way to find anything on
            the device most people are browsing from. */}
        <div className="px-4 pb-2.5 sm:px-6 md:hidden">
          <form onSubmit={submitSearch} role="search">
            <div className="flex overflow-hidden rounded-md">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search Wisdom Shop"
                aria-label="Search products"
                className="w-full bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-500"
              />
              <button type="submit" className="bg-amber-400 px-4 text-sm font-semibold text-slate-900">
                Go
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="bg-slate-800 text-white">
        <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 py-1.5 text-sm sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {CATEGORY_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="whitespace-nowrap rounded px-3 py-1 font-medium transition hover:bg-slate-700"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>

      {menuOpen && (
        <div className="border-b border-slate-200 bg-white px-4 py-3 lg:hidden dark:border-slate-800 dark:bg-slate-900">
          <nav className="flex flex-col gap-1">
            {authenticated ? (
              <>
                <span className="px-2 py-1 text-sm text-slate-500">{user.email}</span>
                <Link href="/account" onClick={() => setMenuOpen(false)} className="rounded px-2 py-2 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800">
                  Your account
                </Link>
                <Link href="/orders" onClick={() => setMenuOpen(false)} className="rounded px-2 py-2 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800">
                  Your orders
                </Link>
                {isStaff && (
                  <Link href="/admin" onClick={() => setMenuOpen(false)} className="rounded px-2 py-2 text-sm font-medium text-brand-600 hover:bg-slate-100 dark:text-brand-400 dark:hover:bg-slate-800">
                    Admin dashboard
                  </Link>
                )}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded px-2 py-2 text-left text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link href="/login" onClick={() => setMenuOpen(false)} className="rounded px-2 py-2 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800">
                  Sign in
                </Link>
                <Link href="/register" onClick={() => setMenuOpen(false)} className="rounded px-2 py-2 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800">
                  Create an account
                </Link>
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
