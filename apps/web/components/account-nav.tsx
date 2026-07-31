"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/account", label: "Overview" },
  { href: "/account/security", label: "Security" },
  { href: "/account/addresses", label: "Addresses" },
  { href: "/account/licenses", label: "Licenses" },
  { href: "/orders", label: "Orders" },
];

export function AccountNav() {
  const pathname = usePathname();

  return (
    <nav className="mb-8 flex flex-wrap gap-2" aria-label="Account">
      {LINKS.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "rounded-full bg-brand-gradient px-4 py-1.5 text-sm font-medium text-white"
                : "rounded-full border border-slate-200 px-4 py-1.5 text-sm font-medium transition hover:border-brand-400 dark:border-slate-800"
            }
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
