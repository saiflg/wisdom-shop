import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { ProductCard } from "@/components/product-card";
import { HeroSlideshow, type HeroSlide } from "@/components/hero-slideshow";
import { fetchProducts } from "@/lib/catalog";

const CATEGORIES = [
  { name: "School & University Books", slug: "school-university-books" },
  { name: "Islamic Books", slug: "islamic-books" },
  { name: "Christian Books", slug: "christian-books" },
  { name: "Novels & Story Books", slug: "novels-story-books" },
  { name: "Courses & Lectures", slug: "courses-lectures" },
  { name: "Educational Software", slug: "educational-software" },
  { name: "Educational Equipment", slug: "educational-equipment" },
];

const SLIDES: HeroSlide[] = [
  {
    id: "everything-educational",
    eyebrow: "One marketplace",
    title: "Everything educational, in one place",
    description:
      "Books, courses, school management software, and equipment — built for students, schools, and institutions worldwide.",
    ctaLabel: "Browse the shop",
    ctaHref: "/products",
    imageUrl: "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=1600",
  },
  {
    id: "courses-lectures",
    eyebrow: "Learn at your pace",
    title: "Courses and lectures from real educators",
    description: "Stream lessons, download materials, and pick up your license instantly after checkout.",
    ctaLabel: "Explore courses",
    ctaHref: "/products?category=courses-lectures",
    imageUrl: "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=1600",
  },
  {
    id: "school-software",
    eyebrow: "For institutions",
    title: "School management software, licensed and ready",
    description: "Buy a license here and finish setup straight into your school's own admin portal.",
    ctaLabel: "See school software",
    ctaHref: "/products?category=educational-software",
    // No stock photo here on purpose: every candidate reused from the seed
    // catalogue turned out to have a person in frame. The icon fallback
    // guarantees that can't happen.
  },
  {
    id: "equipment",
    eyebrow: "Fully equipped",
    title: "Educational equipment for every classroom",
    description: "From lab kits to learning aids, shipped and tracked from order to delivery.",
    ctaLabel: "Shop equipment",
    ctaHref: "/products?category=educational-equipment",
    imageUrl: "https://images.unsplash.com/photo-1508962914676-134849a727f0?w=1600",
  },
  {
    id: "sell-with-us",
    eyebrow: "Vendor marketplace",
    title: "Sell your books, courses, or equipment on Wisdom Shop",
    description: "Apply as a vendor, list your products, and track commission-based earnings in your own dashboard.",
    ctaLabel: "Become a vendor",
    ctaHref: "/vendor",
    imageUrl: "https://images.unsplash.com/photo-1587145820266-a5951ee6f620?w=1600",
  },
];

const VALUE_PROPS = [
  {
    title: "Secure checkout",
    description: "Pay with Stripe, Paystack, Flutterwave, or PayPal — every payment is verified and reconciled.",
  },
  {
    title: "Verified vendors",
    description: "Vendors go through admin approval before they can list, with ownership-scoped inventory.",
  },
  {
    title: "Instant licensing",
    description: "Software and course purchases issue a license the moment an order is marked paid.",
  },
  {
    title: "Tracked, protected orders",
    description: "Every order carries a full status history, from placed to delivered, with refunds when needed.",
  },
];

export default async function HomePage() {
  const featured = await fetchProducts({ sort: "newest", limit: "8" });

  return (
    <main className="min-h-screen">
      <SiteHeader />

      <HeroSlideshow slides={SLIDES} />

      <section className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-6 py-10 sm:px-10 md:grid-cols-4">
          {VALUE_PROPS.map((prop) => (
            <div key={prop.title}>
              <p className="font-semibold text-slate-900 dark:text-slate-100">{prop.title}</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{prop.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-4 pt-16 sm:px-6">
        <h2 className="text-2xl font-bold tracking-tight">Shop by category</h2>
      </section>
      <section className="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-4 pb-16 sm:px-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {CATEGORIES.map((category) => (
          <Link
            key={category.slug}
            href={`/products?category=${category.slug}`}
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
          >
            <p className="font-medium">{category.name}</p>
          </Link>
        ))}
      </section>

      {featured.data.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-2xl font-bold tracking-tight">New arrivals</h2>
            <Link href="/products?sort=newest" className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
              View all
            </Link>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {featured.data.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}

      <section className="border-t border-slate-200 bg-brand-gradient dark:border-slate-800">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-6 py-14 sm:flex-row sm:items-center sm:px-10">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Sell on Wisdom Shop</h2>
            <p className="mt-2 max-w-xl text-white/85">
              Publishers, tutors, and equipment suppliers — reach students and schools already shopping here.
            </p>
          </div>
          <Link
            href="/vendor"
            className="shrink-0 rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-900 transition hover:opacity-90"
          >
            Become a vendor
          </Link>
        </div>
      </section>
    </main>
  );
}
