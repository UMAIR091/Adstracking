import Script from "next/script";

// Google Analytics 4 tag, the recommended Next.js way (next/script, not a raw
// <script> in HTML). Mounted ONCE in the root layout so it runs on every page.
// Loads only in production and only when a measurement id is set, so local/dev
// traffic never pollutes the property. Defaults to the configured id but can be
// overridden with NEXT_PUBLIC_GA_MEASUREMENT_ID.
//
// NOTE: GA's hosts (googletagmanager.com + *.google-analytics.com) are
// allowlisted in the CSP (src/lib/supabase/middleware.ts) — without that the
// tag is silently blocked.
const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "G-XLPL33M3GH";

export function GoogleAnalytics() {
  if (process.env.NODE_ENV !== "production" || !GA_ID) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');`}
      </Script>
    </>
  );
}
