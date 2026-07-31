import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { AdminNav, RequireStaff } from "@/components/require-staff";
import { AdminUserList } from "./admin-user-list";

export const metadata: Metadata = { title: "Admin users — Wisdom Shop" };

export default function AdminUsersPage() {
  return (
    <main className="min-h-screen">
      <SiteHeader />
      <section className="mx-auto max-w-5xl px-6 pb-20">
        <h1 className="mb-6 text-3xl font-bold tracking-tight">Users</h1>
        <AdminNav />
        <RequireStaff>
          <AdminUserList />
        </RequireStaff>
      </section>
    </main>
  );
}
