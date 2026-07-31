import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { CartView } from "./cart-view";

export const metadata: Metadata = {
  title: "Your cart — Wisdom Shop",
  description: "Review the items in your Wisdom Shop cart.",
};

export default function CartPage() {
  return (
    <main className="min-h-screen">
      <SiteHeader />
      <section className="mx-auto max-w-4xl px-6 pb-20">
        <h1 className="text-3xl font-bold tracking-tight">Your cart</h1>
        <CartView />
      </section>
    </main>
  );
}
