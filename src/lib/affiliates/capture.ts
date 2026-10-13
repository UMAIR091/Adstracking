// Affiliate referral capture, run in middleware on every matched request.
//
// A visitor arriving on ?ref=<code> gets a first-party cookie carrying the code
// to signup (lib/affiliates/attach.ts). The cookie is set on exactly the
// visitors and pages the Meta Pixel may measure (lib/metaPixel.ts): never for
// the EEA, the UK or Switzerland, never for a browser sending Global Privacy
// Control, only on the pixel's marketing/signup/billing pages. The pixel
// decides in the browser and falls back to the time zone when the country is
// unknown; middleware sees no time zone, so an unknown country gets no cookie.
//
// Kept deliberately cheap: no database lookup here — an unknown or paused
// code is simply ignored at signup.
import type { NextRequest, NextResponse } from "next/server";
import { countryRequiresConsent, pixelAllowedOnPath } from "@/lib/metaPixel";
import { REF_COOKIE, cookieDays, decodeRefCookie, encodeRefCookie, normalizeRefCode } from "./rules";

export function referralCookieAllowed(args: { path: string; country: string | null; gpc: boolean }): boolean {
  if (args.gpc) return false;
  if (!args.country || countryRequiresConsent(args.country)) return false;
  return pixelAllowedOnPath(args.path);
}

/**
 * Sets, keeps or clears the referral cookie on `response`.
 *
 *   · First touch wins: a valid cookie already present is never overwritten.
 *   · A malformed ?ref= is ignored silently.
 *   · `signedInOnDashboard`: the visitor has an account by now, so the cookie
 *     has done its job. The agency is created — and the referral attached —
 *     while rendering this very request, which still carries the cookie; the
 *     response then expires it, so a later signup on the same browser can't
 *     inherit someone else's referral. (A server component can't clear a
 *     cookie itself, which is why this happens here.)
 *
 * Never throws: a referral must not break a page load.
 */
export function applyReferralCookie(request: NextRequest, response: NextResponse, opts: { signedInOnDashboard: boolean }): void {
  try {
    const present = request.cookies.get(REF_COOKIE)?.value;
    if (opts.signedInOnDashboard) {
      if (present !== undefined) response.cookies.delete(REF_COOKIE);
      return;
    }
    if (decodeRefCookie(present)) return;

    const code = normalizeRefCode(request.nextUrl.searchParams.get("ref"));
    if (!code) return;
    const path = request.nextUrl.pathname;
    const allowed = referralCookieAllowed({
      path,
      country: request.headers.get("x-vercel-ip-country"),
      gpc: request.headers.get("sec-gpc") === "1",
    });
    if (!allowed) return;

    response.cookies.set(REF_COOKIE, encodeRefCookie(code, path), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: cookieDays() * 24 * 60 * 60,
    });
  } catch {
    /* referral capture must never break a request */
  }
}
