import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { RequireApprovedVendor, VendorNav } from "@/components/vendor-gate";
import { EditVendorProduct } from "./edit-vendor-product";

export const metadata: Metadata = { title: "Edit product — Wisdom Shop" };

export default function EditVendorProductPage({ params }: { params: { id: string } }) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
        <h1 className="mb-6 text-2xl font-bold tracking-tight sm:text-3xl">Edit product</h1>
        <VendorNav />
        <RequireApprovedVendor><EditVendorProduct id={params.id} /></RequireApprovedVendor>
      </main>
    </>
  );
}
