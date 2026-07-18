/** @type {import('next').NextConfig} */

// Derive the Supabase origin so connect-src allows the auth/REST/realtime host
// (works whether it's a *.supabase.co URL or a custom domain) without opening
// connect-src up to everything.
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
})();
const supabaseWs = supabaseOrigin.replace(/^https:/, "wss:");

// Conservative Content-Security-Policy. script/style keep 'unsafe-inline'
// because Next.js App Router injects inline bootstrap scripts and the app has
// inline JSON-LD; the high-value directives (object-src none, base-uri,
// form-action, frame-ancestors, restricted connect-src) still contain most
// abuse. Tightening script-src to a nonce is a follow-up. img-src allows any
// https so agency logo URLs render.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigin} ${supabaseWs}`.replace(/\s+/g, " ").trim(),
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
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
