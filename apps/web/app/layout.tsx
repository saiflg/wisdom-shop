import type { Metadata } from "next";
import { Providers } from "./providers";
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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
