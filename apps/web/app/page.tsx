import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

const CATEGORIES = [
  { name: "School & University Books", slug: "school-university-books" },
  { name: "Islamic Books", slug: "islamic-books" },
  { name: "Christian Books", slug: "christian-books" },
  { name: "Novels & Story Books", slug: "novels-story-books" },
  { name: "Courses & Lectures", slug: "courses-lectures" },
  { name: "Educational Software", slug: "educational-software" },
  { name: "Educational Equipment", slug: "educational-equipment" },
];

export default function HomePage() {
  return (
    <main className="min-h-screen">
      <SiteHeader />

      <section className="relative overflow-hidden px-6 py-24 text-center">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-brand-gradient opacity-10 dark:opacity-20"
        />
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
          Everything Educational,{" "}
          <span className="bg-brand-gradient bg-clip-text text-transparent">
            in One Place
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600 dark:text-slate-400">
          Books, courses, school management software, and educational
          equipment — one marketplace built for students, schools, and
          institutions worldwide.
        </p>
        <Link
          href="/products"
          className="mt-8 inline-block rounded-full bg-brand-gradient px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Browse the shop
        </Link>
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
    </main>
  );
}
