import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { RequireApprovedVendor, VendorNav } from "@/components/vendor-gate";
import { EarningsTable } from "./earnings-table";

export const metadata: Metadata = { title: "Earnings — Wisdom Shop" };

export default function VendorEarningsPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
        <h1 className="mb-6 text-2xl font-bold tracking-tight sm:text-3xl">Earnings</h1>
        <VendorNav />
        <RequireApprovedVendor><EarningsTable /></RequireApprovedVendor>
      </main>
    </>
  );
}
