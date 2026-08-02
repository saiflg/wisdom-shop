import { RequireAuth } from "@/components/require-auth";
import { Sidebar } from "@/components/sidebar";
import { AppHeader, Breadcrumbs } from "@/components/app-header";

/**
 * ERP shell: a persistent left sidebar for module navigation and a top
 * header for global controls only. Both live inside RequireAuth so the
 * chrome never renders for a signed-out user.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader />
          <main className="flex-1 overflow-y-auto px-6 py-6">
            <div className="mx-auto max-w-6xl">
              <Breadcrumbs />
              {children}
            </div>
          </main>
        </div>
      </div>
    </RequireAuth>
  );
}
