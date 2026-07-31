import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { OrderDetail } from "./order-detail";

export const metadata: Metadata = {
  title: "Order — Wisdom Shop",
  description: "Your Wisdom Shop order details.",
};

export default function OrderDetailPage({ params }: { params: { orderNumber: string } }) {
  return (
    <main className="min-h-screen">
      <SiteHeader />
      <section className="mx-auto max-w-3xl px-6 pb-20">
        <OrderDetail orderNumber={params.orderNumber} />
      </section>
    </main>
  );
}
