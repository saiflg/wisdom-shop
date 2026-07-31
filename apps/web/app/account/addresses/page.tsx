import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { AccountNav } from "@/components/account-nav";
import { RequireAuth } from "@/components/require-auth";
import { AddressBook } from "./address-book";

export const metadata: Metadata = {
  title: "Addresses — Wisdom Shop",
  description: "Manage your saved delivery addresses.",
};

export default function AddressesPage() {
  return (
    <main className="min-h-screen">
      <SiteHeader />
      <section className="mx-auto max-w-3xl px-6 pb-20">
        <h1 className="mb-6 text-3xl font-bold tracking-tight">Addresses</h1>
        <AccountNav />
        <RequireAuth>
          <AddressBook />
        </RequireAuth>
      </section>
    </main>
  );
}
