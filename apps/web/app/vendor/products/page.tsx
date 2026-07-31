import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { RequireApprovedVendor, VendorNav } from "@/components/vendor-gate";
import { VendorProductList } from "./vendor-product-list";

export const metadata: Metadata = { title: "Your products — Wisdom Shop" };

export default function VendorProductsPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
        <h1 className="mb-6 text-2xl font-bold tracking-tight sm:text-3xl">Your products</h1>
        <VendorNav />
        <RequireApprovedVendor><VendorProductList /></RequireApprovedVendor>
      </main>
    </>
  );
}
