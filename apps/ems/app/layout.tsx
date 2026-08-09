import type { Metadata } from "next";
import { headers } from "next/headers";
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
  // The hostname is asked first, inside getBranding. This is the fallback for
  // a deployment where schools have no subdomain of their own: middleware.ts
  // lifts the slug out of `?schoolSlug=` — which a layout cannot read — or
  // out of the cookie it set on a previous request, so the console keeps the
  // school's colours after navigating away from the link that named it.
  // `||`, not `??`: the middleware sets this to "" when nothing resolved, so
  // that an empty value overrides anything a client sent under the same name.
  const { branding } = await getBranding(headers().get("x-school-slug") || undefined);

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
