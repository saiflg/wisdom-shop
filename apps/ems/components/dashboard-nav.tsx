"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/store/auth-store";

const LINKS = [
  { href: "/classes", label: "Classes" },
  { href: "/students", label: "Students" },
  { href: "/teachers", label: "Teachers" },
];

export function DashboardNav() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const clearSession = useAuthStore((s) => s.clearSession);

  return (
    <header className="border-b border-slate-200 dark:border-slate-800">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-4">
        <Link href="/classes" className="text-lg font-bold tracking-tight">
          Wisdom <span className="text-brand-500">Campus</span>
        </Link>
        <nav className="flex gap-1">
          {LINKS.map((link) => {
            const active = pathname?.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "rounded-full bg-brand-gradient px-4 py-1.5 text-sm font-medium text-white"
                    : "rounded-full px-4 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                }
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
          {user && <span>{user.schoolSlug}</span>}
          <button
            type="button"
            onClick={() => {
              clearSession();
              window.location.href = "/login";
            }}
            className="font-medium hover:underline"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
