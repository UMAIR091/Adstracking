import { describe, expect, it } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { applyReferralCookie, referralCookieAllowed } from "./capture";
import { REF_COOKIE } from "./rules";

// The referral cookie is set where — and only where — the Meta Pixel may
// measure, keeps the first touch, and is cleared once the visitor is signed in.

function run(url: string, opts: { country?: string | null; gpc?: boolean; cookie?: string; signedInOnDashboard?: boolean } = {}) {
  const headers = new Headers();
  if (opts.country !== null) headers.set("x-vercel-ip-country", opts.country ?? "US");
  if (opts.gpc) headers.set("sec-gpc", "1");
  if (opts.cookie !== undefined) headers.set("cookie", `${REF_COOKIE}=${opts.cookie}`);
  const request = new NextRequest(url, { headers });
  const response = NextResponse.next();
  applyReferralCookie(request, response, { signedInOnDashboard: opts.signedInOnDashboard ?? false });
  return response.cookies.get(REF_COOKIE);
}

describe("referralCookieAllowed mirrors the pixel's consent gate", () => {
  it("allows a non-consent country on a pixel page", () => {
    expect(referralCookieAllowed({ path: "/", country: "US", gpc: false })).toBe(true);
    expect(referralCookieAllowed({ path: "/pricing", country: "in", gpc: false })).toBe(true);
  });

  it("refuses the EEA, UK and Switzerland, GPC, an unknown country and non-pixel pages", () => {
    expect(referralCookieAllowed({ path: "/", country: "DE", gpc: false })).toBe(false);
    expect(referralCookieAllowed({ path: "/", country: "GB", gpc: false })).toBe(false);
    expect(referralCookieAllowed({ path: "/", country: "CH", gpc: false })).toBe(false);
    expect(referralCookieAllowed({ path: "/", country: "US", gpc: true })).toBe(false);
    expect(referralCookieAllowed({ path: "/", country: null, gpc: false })).toBe(false);
    expect(referralCookieAllowed({ path: "/r/abc123", country: "US", gpc: false })).toBe(false);
  });
});

describe("applyReferralCookie", () => {
  it("sets an HttpOnly, Lax, first-party cookie carrying the code and landing path", () => {
    const c = run("https://tryreportflow.com/pricing?ref=Creator");
    expect(c?.value).toBe("creator:/pricing");
    expect(c).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 24 * 60 * 60 });
  });

  it("ignores a malformed code", () => {
    expect(run("https://tryreportflow.com/?ref=bad%20code")).toBeUndefined();
    expect(run("https://tryreportflow.com/?ref=")).toBeUndefined();
  });

  it("keeps the first touch", () => {
    expect(run("https://tryreportflow.com/?ref=second", { cookie: "first:/" })).toBeUndefined();
  });

  it("replaces a cookie that isn't a valid referral", () => {
    expect(run("https://tryreportflow.com/?ref=second", { cookie: "BAD VALUE" })?.value).toBe("second:/");
  });

  it("sets nothing where the pixel wouldn't run", () => {
    expect(run("https://tryreportflow.com/?ref=creator", { country: "FR" })).toBeUndefined();
    expect(run("https://tryreportflow.com/?ref=creator", { gpc: true })).toBeUndefined();
    expect(run("https://tryreportflow.com/?ref=creator", { country: null })).toBeUndefined();
  });

  it("expires the cookie on the first signed-in dashboard response", () => {
    const c = run("https://tryreportflow.com/dashboard", { cookie: "creator:/", signedInOnDashboard: true });
    expect(c?.value).toBe("");
    expect(c?.expires instanceof Date ? c.expires.getTime() : Number(c?.expires)).toBeLessThanOrEqual(Date.now());
  });
});
