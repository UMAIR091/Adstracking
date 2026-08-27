import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { COMPANY } from "@/lib/company";
import { AnalyticsProvider } from "@/components/AnalyticsProvider";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import "./globals.css";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? COMPANY.website;

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: "ReportFlow — Beautiful white-label client reports on autopilot",
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
    <html lang="en">
      <body className="font-sans antialiased">
        {/* Applies the saved theme before the page paints. A plain classic
            script, not next/script: beforeInteractive only emitted a preload
            and never executed. Loaded from /public so it needs no per-request
            nonce, which would have forced every static page to render
            dynamically. The dashboard, whose CSP ignores 'self', inlines the
            same snippet with its nonce instead. */}
        <script src="/theme.js" />
        <GoogleAnalytics />
        <Suspense fallback={null}>
          <AnalyticsProvider>{children}</AnalyticsProvider>
        </Suspense>
      </body>
    </html>
  );
}
