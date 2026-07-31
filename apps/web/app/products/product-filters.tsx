"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { CategoryNode } from "@/lib/catalog";

const PRODUCT_TYPES = [
  "PHYSICAL",
  "DIGITAL",
  "SUBSCRIPTION",
  "LICENSE",
  "DOWNLOADABLE",
  "SOFTWARE",
  "SERVICE",
  "BUNDLE",
  "GIFT_CARD",
  "MEMBERSHIP",
  "COURSE",
];

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
];

function flatten(nodes: CategoryNode[], depth = 0): { slug: string; label: string }[] {
  return nodes.flatMap((node) => [
    { slug: node.slug, label: `${"— ".repeat(depth)}${node.name}` },
    ...flatten(node.children, depth + 1),
  ]);
}

export function ProductFilters({ categories }: { categories: CategoryNode[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");

  const options = flatten(categories);

  function apply(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    // Any filter change invalidates the current page offset.
    params.delete("page");
    router.push(`/products?${params.toString()}`);
  }

  const selectClass =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900";

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply({ search });
        }}
      >
        <label htmlFor="search" className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
          Search
        </label>
        <input
          id="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products…"
          className={selectClass}
        />
      </form>

      <div>
        <label htmlFor="category" className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
          Category
        </label>
        <select
          id="category"
          value={searchParams.get("category") ?? ""}
          onChange={(e) => apply({ category: e.target.value })}
          className={selectClass}
        >
          <option value="">All categories</option>
          {options.map((option) => (
            <option key={option.slug} value={option.slug}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="type" className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
          Product type
        </label>
        <select
          id="type"
          value={searchParams.get("type") ?? ""}
          onChange={(e) => apply({ type: e.target.value })}
          className={selectClass}
        >
          <option value="">All types</option>
          {PRODUCT_TYPES.map((type) => (
            <option key={type} value={type}>
              {type.toLowerCase().replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="sort" className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
          Sort by
        </label>
        <select
          id="sort"
          value={searchParams.get("sort") ?? "newest"}
          onChange={(e) => apply({ sort: e.target.value })}
          className={selectClass}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
