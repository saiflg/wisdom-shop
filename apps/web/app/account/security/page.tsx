import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { AccountNav } from "@/components/account-nav";
import { RequireAuth } from "@/components/require-auth";
import { ChangePasswordForm } from "./change-password-form";
import { TwoFactorPanel } from "./two-factor-panel";

export const metadata: Metadata = {
  title: "Security — Wisdom Shop",
  description: "Manage your password and two-factor authentication.",
};

export default function SecurityPage() {
  return (
    <main className="min-h-screen">
      <SiteHeader />
      <section className="mx-auto max-w-3xl px-6 pb-20">
        <h1 className="mb-6 text-3xl font-bold tracking-tight">Security</h1>
        <AccountNav />
        <RequireAuth>
          <div className="space-y-10">
            <ChangePasswordForm />
            <TwoFactorPanel />
          </div>
        </RequireAuth>
      </section>
    </main>
  );
}
