import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { AdminNav, RequireStaff } from "@/components/require-staff";
import { CouponManager } from "./coupon-manager";

export const metadata: Metadata = { title: "Coupons — Wisdom Shop" };

export default function AdminCouponsPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
        <h1 className="mb-6 text-2xl font-bold tracking-tight sm:text-3xl">Coupons</h1>
        <AdminNav />
        <RequireStaff>
          <CouponManager />
        </RequireStaff>
      </main>
    </>
  );
}
