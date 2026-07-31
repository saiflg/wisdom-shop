import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { OrdersList } from "./orders-list";

export const metadata: Metadata = {
  title: "Your orders — Wisdom Shop",
  description: "Review your Wisdom Shop order history.",
};

export default function OrdersPage() {
  return (
    <main className="min-h-screen">
      <SiteHeader />
      <section className="mx-auto max-w-4xl px-6 pb-20">
        <h1 className="text-3xl font-bold tracking-tight">Your orders</h1>
        <OrdersList />
      </section>
    </main>
  );
}
