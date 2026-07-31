import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { AdminNav, RequireStaff } from "@/components/require-staff";
import { ProductList } from "./product-list";

export const metadata: Metadata = { title: "Products — Wisdom Shop" };

export default function AdminProductsPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <h1 className="mb-6 text-2xl font-bold tracking-tight sm:text-3xl">Products</h1>
        <AdminNav />
        <RequireStaff>
          <ProductList />
        </RequireStaff>
      </main>
    </>
  );
}
