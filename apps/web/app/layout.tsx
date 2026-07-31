import type { Metadata } from "next";
import { Providers } from "./providers";
import { SiteFooter } from "@/components/site-footer";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wisdom Shop — Everything Educational in One Place",
  description:
    "Wisdom Shop is a world-class educational marketplace for books, courses, school management software, and educational equipment.",
  openGraph: {
    title: "Wisdom Shop",
    description: "Everything Educational in One Place",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {/* The footer lives here rather than in each page so it cannot be
            forgotten on a new route, and so the flex column keeps it at the
            bottom of short pages instead of floating mid-screen. */}
        <Providers>
          <div className="flex min-h-screen flex-col">
            <div className="flex-1">{children}</div>
            <SiteFooter />
          </div>
        </Providers>
      </body>
    </html>
  );
}
