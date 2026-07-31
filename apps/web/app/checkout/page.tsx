import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { CheckoutView } from "./checkout-view";

export const metadata: Metadata = {
  title: "Checkout — Wisdom Shop",
  description: "Complete your Wisdom Shop order.",
};

export default function CheckoutPage() {
  return (
    <main className="min-h-screen">
      <SiteHeader />
      <section className="mx-auto max-w-3xl px-6 pb-20">
        <h1 className="text-3xl font-bold tracking-tight">Checkout</h1>
        <CheckoutView />
      </section>
    </main>
  );
}
