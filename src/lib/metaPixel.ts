// Meta Pixel: the browser half of ad measurement. The server half, which
// reports the first real payment, is lib/metaCapi.ts.
//
// The pixel loads only where it measures our own funnel: the public marketing
// pages, signup, and the billing page where checkout opens. It never loads on a
// client's white-label report (/r/…), elsewhere in the dashboard, or in
// onboarding. It is skipped for visitors in the EEA, the UK and Switzerland,
// where it would need prior consent we don't ask for, and for any browser
// sending Global Privacy Control. Everything here is a silent no-op when the
// pixel isn't loaded, so callers never need to check.
export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || "1384300833764400";

// Cookie set by middleware from Vercel's geo header (see lib/supabase/middleware.ts).
export const COUNTRY_COOKIE = "av_cc";

// EU member states, the rest of the EEA (IS, LI, NO), the UK and Switzerland.
const CONSENT_REQUIRED = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU",
  "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO", "GB", "CH",
]);

const ALLOWED_PREFIXES = [
  "/pricing",
  "/sample-report",
  "/about",
  "/contact",
  "/help",
  "/changelog",
  "/security",
  "/signup",
  "/dashboard/billing",
];

export function pixelAllowedOnPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function visitorAllowsAdMeasurement(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  if (nav.globalPrivacyControl === true) return false;
  const country = readCookie(COUNTRY_COOKIE);
  if (country) return !CONSENT_REQUIRED.has(country.toUpperCase());
  // No country (the cookie was blocked, or the request never passed through
  // middleware): fall back to the time zone, erring towards not loading.
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  return !(tz.startsWith("Europe/") || tz.startsWith("Atlantic/") || tz === "");
}

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[];
  push: Fbq;
  loaded: boolean;
  version: string;
  disablePushState?: boolean;
};

// Meta's standard base code, written out so no inline script is needed (the
// dashboard's nonce CSP would block one). Automatic history-change page views
// and autoConfig (button-click and form scraping) are both switched off: every
// event this pixel sends is one we fire explicitly below.
export function loadMetaPixel(): void {
  const w = window as unknown as { fbq?: Fbq; _fbq?: Fbq };
  if (w.fbq) return;
  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue.push(args);
  } as Fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];
  fbq.disablePushState = true;
  w.fbq = fbq;
  if (!w._fbq) w._fbq = fbq;

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);

  fbq("set", "autoConfig", false, META_PIXEL_ID);
  fbq("init", META_PIXEL_ID);
}

// Fires a standard event. eventId lets the server-side copy of the same event
// (lib/metaCapi.ts) be deduplicated against this one.
export function metaTrack(event: string, params?: Record<string, unknown>, eventId?: string): void {
  try {
    if (typeof window === "undefined") return;
    const fbq = (window as unknown as { fbq?: Fbq }).fbq;
    if (!fbq) return;
    if (eventId) fbq("track", event, params ?? {}, { eventID: eventId });
    else fbq("track", event, params ?? {});
  } catch {
    /* ad measurement must never break the app */
  }
}
