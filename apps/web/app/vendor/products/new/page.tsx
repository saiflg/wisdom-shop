import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { RequireApprovedVendor, VendorNav } from "@/components/vendor-gate";
import { ProductForm } from "@/app/admin/products/product-form";

export const metadata: Metadata = { title: "New product — Wisdom Shop" };

export default function NewVendorProductPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
        <h1 className="mb-6 text-2xl font-bold tracking-tight sm:text-3xl">New product</h1>
        <VendorNav />
        <RequireApprovedVendor><ProductForm scope="vendor" /></RequireApprovedVendor>
      </main>
    </>
  );
}
