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

export default nextConfig;
