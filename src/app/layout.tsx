import type { Metadata, Viewport } from "next";
import { COMPANY } from "@/lib/company";
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
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
