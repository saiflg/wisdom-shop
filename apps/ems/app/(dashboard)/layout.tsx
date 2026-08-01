import { RequireAuth } from "@/components/require-auth";
import { DashboardNav } from "@/components/dashboard-nav";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen">
      <DashboardNav />
      <RequireAuth>
        <div className="mx-auto max-w-6xl px-6 py-10">{children}</div>
      </RequireAuth>
    </main>
  );
}
