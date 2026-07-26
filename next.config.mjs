/** @type {import('next').NextConfig} */

// NOTE: Content-Security-Policy is set per-request in middleware
// (src/lib/supabase/middleware.ts) so it can carry a fresh nonce and use
// 'strict-dynamic'. The static, non-nonce headers below apply to every response
// (including static assets that bypass middleware).

const securityHeaders = [
  // Enforce HTTPS for a year, including subdomains.
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  // Never MIME-sniff responses.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Only allow same-origin framing (protects the dashboard from clickjacking;
  // public /r/ share links are still viewable directly).
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Send the origin only when crossing origins.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The app uses none of these browser features.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig = {
  reactStrictMode: true,
  // Don't advertise the framework/version (audit #10).
  poweredByHeader: false,
  // @react-pdf/renderer (used server-side for PDF attachments) ships fontkit and
  // a wasm layout engine — keep it out of the webpack bundle so it loads natively.
  experimental: {
    serverComponentsExternalPackages: ["@react-pdf/renderer"],
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

// Wrap with Sentry ONLY when a DSN is configured. This means zero Sentry client
// bundle / build overhead until you enable it (set NEXT_PUBLIC_SENTRY_DSN +
// SENTRY_DSN in the environment and redeploy) — and full frontend+backend error
// tracking, with source maps when SENTRY_AUTH_TOKEN is also set, once you do.
import { withSentryConfig } from "@sentry/nextjs";

const sentryEnabled = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN);

export default sentryEnabled
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: !process.env.CI,
      widenClientFileUpload: true,
      // Route Sentry's browser requests through the app to dodge ad-blockers.
      tunnelRoute: "/monitoring",
    })
  : nextConfig;
