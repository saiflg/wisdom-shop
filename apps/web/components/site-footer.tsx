import Link from "next/link";

const COLUMNS = [
  {
    heading: "Shop",
    links: [
      { label: "All products", href: "/products" },
      { label: "Books", href: "/products?type=DIGITAL" },
      { label: "Courses", href: "/products?type=COURSE" },
      { label: "Software & licences", href: "/products?type=SOFTWARE" },
      { label: "Equipment", href: "/products?type=PHYSICAL" },
    ],
  },
  {
    heading: "Your account",
    links: [
      { label: "Sign in", href: "/login" },
      { label: "Create an account", href: "/register" },
      { label: "Your orders", href: "/orders" },
      { label: "Your licences", href: "/account/licenses" },
      { label: "Addresses", href: "/account/addresses" },
    ],
  },
  {
    heading: "Sell with us",
    links: [
      { label: "Become a vendor", href: "/vendor" },
      { label: "Your products", href: "/vendor/products" },
      { label: "Your earnings", href: "/vendor/earnings" },
    ],
  },
  {
    heading: "Help",
    links: [
      { label: "Security & 2FA", href: "/account/security" },
      { label: "Your cart", href: "/cart" },
    ],
  },
];

/**
 * Site-wide footer.
 *
 * Every link points at a route that exists. Footers are the usual home of
 * plausible-looking links to pages nobody built — "Careers", "Press",
 * "Returns Policy" — and a dead link in the footer is worse than an absent
 * one, because it reads as neglect rather than as work in progress.
 */
export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
      <Link
        href="#top"
        className="block bg-slate-800 py-3 text-center text-sm font-medium text-white transition hover:bg-slate-700"
      >
        Back to top
      </Link>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:py-12">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {COLUMNS.map((column) => (
            <div key={column.heading}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-900 dark:text-slate-100">
                {column.heading}
              </h2>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={`${column.heading}-${link.label}`}>
                    <Link
                      href={link.href}
                      className="text-sm text-slate-600 transition hover:text-brand-600 hover:underline dark:text-slate-400 dark:hover:text-brand-400"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-center gap-3 border-t border-slate-200 pt-6 text-center dark:border-slate-800 sm:flex-row sm:justify-between sm:text-left">
          <Link href="/" className="text-base font-semibold tracking-tight">
            Wisdom <span className="text-brand-500">Shop</span>
          </Link>
          <p className="text-xs text-slate-500 dark:text-slate-500">
            © {year} Wisdom Shop. Educational books, courses, software and equipment.
          </p>
        </div>
      </div>
    </footer>
  );
}
