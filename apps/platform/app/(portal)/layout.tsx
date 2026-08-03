"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { RequirePlatformAuth } from "@/components/require-platform-auth";
import { usePlatformAuthStore } from "@/store/platform-auth-store";

const LINKS = [{ href: "/schools", label: "Tenants" }];

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const user = usePlatformAuthStore((s) => s.user);
  const clearSession = usePlatformAuthStore((s) => s.clearSession);

  return (
    <RequirePlatformAuth>
      <div className="flex h-screen overflow-hidden">
        <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-platform-50 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex h-16 items-center border-b border-slate-200 px-4 dark:border-slate-800">
            <Link href="/schools" className="text-sm font-bold leading-tight tracking-tight">
              Wisdom Campus
              <span className="block text-xs font-semibold uppercase tracking-widest text-platform-500">
                Platform console
              </span>
            </Link>
          </div>
          <nav className="flex-1 p-2">
            <ul className="space-y-0.5">
              {LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={pathname.startsWith(link.href) ? "page" : undefined}
                    className={clsx(
                      "block rounded-lg px-3 py-2 text-sm font-medium transition",
                      pathname.startsWith(link.href)
                        ? "bg-platform-700 text-white"
                        : "text-slate-700 hover:bg-platform-100 dark:text-slate-300 dark:hover:bg-slate-800",
                    )}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
            {/* Subscriptions, billing, marketplace, monitoring and support
                are part of the console's remit but have no backend yet, so
                they are intentionally absent rather than shown as dead
                links — same rule as the school portal's sidebar. */}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 px-4 dark:border-slate-800">
            <span className="ml-auto text-sm text-slate-600 dark:text-slate-400">{user?.roles.join(", ")}</span>
            <button
              type="button"
              onClick={() => {
                clearSession();
                router.replace("/login");
              }}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-900"
            >
              Sign out
            </button>
          </header>
          <main className="flex-1 overflow-y-auto px-6 py-6">
            <div className="mx-auto max-w-5xl">{children}</div>
          </main>
        </div>
      </div>
    </RequirePlatformAuth>
  );
}
