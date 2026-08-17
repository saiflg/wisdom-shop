"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { SessionBootstrap } from "@/components/session-bootstrap";
import { SchoolLocale } from "@/components/school-locale";
import { I18nProvider } from "@/lib/i18n/i18n-provider";
import { ThemeProvider } from "@/lib/theme-provider";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <I18nProvider>
          <SessionBootstrap />
          {/* Inside the provider, because it sets the language; outside any
              page, because the school's default applies to the login screen
              too. Renders nothing. */}
          <SchoolLocale />
          {children}
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
