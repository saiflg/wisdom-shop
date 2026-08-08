import { RequireAuth } from "@/components/require-auth";
import { Sidebar } from "@/components/sidebar";
import { AppHeader, Breadcrumbs } from "@/components/app-header";
import { AccessibilityPreferences } from "@/components/accessibility-preferences";

/**
 * ERP shell: a persistent left sidebar for module navigation and a top
 * header for global controls only. Both live inside RequireAuth so the
 * chrome never renders for a signed-out user.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <AccessibilityPreferences />
      {/* The first thing a keyboard or screen-reader user reaches, so the
          sidebar does not have to be traversed on every single page. */}
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader />
          <main id="main" tabIndex={-1} className="flex-1 overflow-y-auto px-6 py-6">
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
