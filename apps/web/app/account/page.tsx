import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { AccountNav } from "@/components/account-nav";
import { AccountOverview } from "./account-overview";

export const metadata: Metadata = {
  title: "Your account — Wisdom Shop",
  description: "Manage your Wisdom Shop account.",
};

export default function AccountPage() {
  return (
    <main className="min-h-screen">
      <SiteHeader />
      <section className="mx-auto max-w-3xl px-6 pb-20">
        <h1 className="mb-6 text-3xl font-bold tracking-tight">Your account</h1>
        <AccountNav />
        <AccountOverview />
      </section>
    </main>
  );
}
