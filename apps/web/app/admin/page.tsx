import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { AdminNav, RequireStaff } from "@/components/require-staff";
import { AdminOverview } from "./admin-overview";

export const metadata: Metadata = {
  title: "Admin — Wisdom Shop",
  description: "Wisdom Shop administration.",
};

export default function AdminPage() {
  return (
    <main className="min-h-screen">
      <SiteHeader />
      <section className="mx-auto max-w-5xl px-6 pb-20">
        <h1 className="mb-6 text-3xl font-bold tracking-tight">Admin</h1>
        <AdminNav />
        <RequireStaff>
          <AdminOverview />
        </RequireStaff>
      </section>
    </main>
  );
}
