"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import { useIsStaff } from "@/lib/use-admin";
import { useCart, CART_QUERY_KEY } from "@/lib/use-cart";
import { ThemeToggle } from "@/app/theme-toggle";

export function SiteHeader() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, status, clearSession } = useAuthStore();
  const isStaff = useIsStaff();
  const { data: cart } = useCart();

  async function handleLogout() {
    try {
      await apiFetch("/v1/auth/logout", { method: "POST", csrf: true });
    } catch {
      // Cookie may already be invalid/expired — clear local state regardless.
    }
    clearSession();
    // Drop the previous user's cart so it can't flash for the next visitor.
    queryClient.removeQueries({ queryKey: CART_QUERY_KEY });
    router.push("/");
    router.refresh();
  }

  return (
    <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
      <Link href="/" className="text-lg font-semibold tracking-tight">
        Wisdom <span className="text-brand-500">Shop</span>
      </Link>

      <nav className="flex items-center gap-4">
        <Link href="/products" className="text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100">
          Shop
        </Link>

        <Link
          href="/cart"
          className="relative text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
        >
          Cart
          {cart && cart.itemCount > 0 && (
            <span
              aria-label={`${cart.itemCount} items in cart`}
              className="absolute -right-3 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1 text-xs font-semibold text-white"
            >
              {cart.itemCount}
            </span>
          )}
        </Link>

        {status === "authenticated" && user ? (
          <div className="flex items-center gap-3">
            <Link
              href="/orders"
              className="text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            >
              Orders
            </Link>
            <Link
              href="/account"
              className="text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            >
              Account
            </Link>
            {isStaff && (
              <Link
                href="/admin"
                className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
              >
                Admin
              </Link>
            )}
            <span className="hidden text-sm text-slate-600 dark:text-slate-400 sm:inline">{user.email}</span>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-full border border-slate-200 px-4 py-1.5 text-sm font-medium transition hover:border-brand-400 dark:border-slate-800"
            >
              Sign out
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-full px-4 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="rounded-full bg-brand-gradient px-4 py-1.5 text-sm font-medium text-white transition hover:opacity-90"
            >
              Sign up
            </Link>
          </div>
        )}

        <ThemeToggle />
      </nav>
    </header>
  );
}
