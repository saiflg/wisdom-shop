import type { Metadata } from "next";
import { Providers } from "./providers";
import { brandingStyle } from "@/lib/branding";
import { getBranding } from "@/lib/branding-server";
import { BrandingProvider } from "@/lib/branding-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wisdom Campus — AI-Powered School Management",
  description:
    "An AI-powered multi-tenant school management and learning platform, currently in development.",
};

/**
 * Resolved per request from the hostname, so this layout cannot be static.
 *
 * Next would otherwise prerender it once at build time and serve every
 * school the colours of whichever host happened to build it — the kind of
 * cross-tenant bleed that is invisible in dev, where nothing is prerendered.
 */
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { branding } = await getBranding();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Server-rendered so the school's colours are in the first paint.
            Setting these from an effect would show the default blue for a
            frame on every navigation. */}
        {branding && <style dangerouslySetInnerHTML={{ __html: brandingStyle(branding) }} />}
      </head>
      <body>
        <BrandingProvider branding={branding}>
          <Providers>{children}</Providers>
        </BrandingProvider>
      </body>
    </html>
  );
}
