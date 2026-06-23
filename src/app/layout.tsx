import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ReportFlow — Beautiful white-label client reports on autopilot",
  description:
    "The fastest way for marketing agencies to send beautiful, white-label client reports. Flat pricing, unlimited clients, zero setup.",
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
