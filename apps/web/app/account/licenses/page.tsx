import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { AccountNav } from "@/components/account-nav";
import { RequireAuth } from "@/components/require-auth";
import { LicenseList } from "./license-list";

export const metadata: Metadata = {
  title: "Licenses — Wisdom Shop",
  description: "Your software license keys and school setup.",
};

export default function LicensesPage() {
  return (
    <main className="min-h-screen">
      <SiteHeader />
      <section className="mx-auto max-w-3xl px-6 pb-20">
        <h1 className="mb-6 text-3xl font-bold tracking-tight">Licenses</h1>
        <AccountNav />
        <RequireAuth>
          <LicenseList />
        </RequireAuth>
      </section>
    </main>
  );
}
