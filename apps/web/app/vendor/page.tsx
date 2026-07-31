import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { VendorNav } from "@/components/vendor-gate";
import { VendorOverview } from "./vendor-overview";

export const metadata: Metadata = { title: "Vendor — Wisdom Shop" };

export default function VendorPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
        <h1 className="mb-6 text-2xl font-bold tracking-tight sm:text-3xl">Your store</h1>
        <VendorNav />
        <VendorOverview />
      </main>
    </>
  );
}
