import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { AdminNav, RequireStaff } from "@/components/require-staff";
import { AdminOrderList } from "./admin-order-list";

export const metadata: Metadata = { title: "Admin orders — Wisdom Shop" };

export default function AdminOrdersPage() {
  return (
    <main className="min-h-screen">
      <SiteHeader />
      <section className="mx-auto max-w-5xl px-6 pb-20">
        <h1 className="mb-6 text-3xl font-bold tracking-tight">Orders</h1>
        <AdminNav />
        <RequireStaff>
          <AdminOrderList />
        </RequireStaff>
      </section>
    </main>
  );
}
