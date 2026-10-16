import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Unbounded } from "next/font/google";
import { COMPANY } from "@/lib/company";
import { AnalyticsProvider } from "@/components/AnalyticsProvider";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import { MetaPixel } from "@/components/MetaPixel";
import "./globals.css";

// Wordmark face only — exposed as --font-brand and read by <Brand />.
const brandFont = Unbounded({
  subsets: ["latin"],
  weight: ["600"],
  variable: "--font-brand",
  display: "swap",
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? COMPANY.website;

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: "Anavyst — Beautiful white-label client reports on autopilot",
  description:
    "The fastest way for marketing agencies to send beautiful, white-label client reports. Every feature on every plan, zero setup.",
  openGraph: {
    siteName: COMPANY.product,
    type: "website",
    url: APP_URL,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Matches --surface-muted in each theme, so browser chrome blends with the
  // page rather than framing it in the wrong one.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#B3B1B1" },
    { media: "(prefers-color-scheme: dark)", color: "#09090B" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={brandFont.variable}>
      <body className="font-sans antialiased">
        {/* Applies the saved theme before the page paints. A plain classic
            script, not next/script: beforeInteractive only emitted a preload
            and never executed. Loaded from /public so it needs no per-request
            nonce, which would have forced every static page to render
            dynamically. The dashboard, whose CSP ignores 'self', inlines the
            same snippet with its nonce instead. */}
        <script src="/theme.js" />
        <GoogleAnalytics />
        <MetaPixel />
        {/* Only the pageview tracker suspends (it reads the search params).
            It used to wrap the whole app, so every page rendered inside a
            Suspense boundary and the 200 status was sent before a page could
            call notFound(): unknown share links and other missing pages
            answered "200 Page not found". */}
        <Suspense fallback={null}>
          <AnalyticsProvider />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
