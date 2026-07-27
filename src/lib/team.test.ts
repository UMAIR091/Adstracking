import { describe, it, expect } from "vitest";
import {
  generateInviteToken, hashInviteToken, isValidEmail, isInviteRole,
  normalizeEmail, inviteExpiry, inviteUrl, INVITE_TTL_DAYS,
} from "./team";
import { safeNext } from "@/lib/safeNext";
import { invitationEmailHtml } from "@/lib/email/template";

describe("invite tokens", () => {
  it("generates unique, URL-safe tokens", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateInviteToken()));
    expect(tokens.size).toBe(200);
    for (const t of tokens) expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("produces enough entropy to resist guessing", () => {
    // 32 random bytes → 43 base64url chars. Anything shorter would weaken the
    // only secret protecting workspace access.
    expect(generateInviteToken().length).toBeGreaterThanOrEqual(43);
  });

  it("hashes deterministically and irreversibly", () => {
    const t = generateInviteToken();
    expect(hashInviteToken(t)).toBe(hashInviteToken(t));
    expect(hashInviteToken(t)).toMatch(/^[a-f0-9]{64}$/);
    // The stored value must not contain the token itself.
    expect(hashInviteToken(t)).not.toContain(t);
  });

  it("gives different tokens different hashes", () => {
    expect(hashInviteToken(generateInviteToken())).not.toBe(hashInviteToken(generateInviteToken()));
  });

  it("expires in the future, by the advertised window", () => {
    const now = new Date("2026-07-27T00:00:00Z");
    const exp = new Date(inviteExpiry(now));
    const days = (exp.getTime() - now.getTime()) / 86_400_000;
    expect(days).toBe(INVITE_TTL_DAYS);
  });

  it("builds an absolute invite URL containing the token", () => {
    const t = generateInviteToken();
    expect(inviteUrl(t)).toMatch(/^https?:\/\/.+\/invite\/[A-Za-z0-9_-]+$/);
    expect(inviteUrl(t).endsWith(`/invite/${t}`)).toBe(true);
  });
});

describe("email + role validation", () => {
  it("accepts ordinary addresses and rejects malformed ones", () => {
    for (const good of ["a@b.co", "first.last+tag@sub.example.com"]) expect(isValidEmail(good)).toBe(true);
    for (const bad of ["", "nope", "a@b", "a b@c.com", "@b.com", "a@"]) expect(isValidEmail(bad)).toBe(false);
  });

  it("normalises case and surrounding space so re-invites match", () => {
    expect(normalizeEmail("  Person@Example.COM ")).toBe("person@example.com");
  });

  it("only allows admin or member as an invited role", () => {
    expect(isInviteRole("admin")).toBe(true);
    expect(isInviteRole("member")).toBe(true);
    // "owner" must never be grantable by invitation — that would let an admin
    // mint a second owner of someone else's workspace.
    expect(isInviteRole("owner")).toBe(false);
    expect(isInviteRole(undefined)).toBe(false);
  });
});

describe("invitation email", () => {
  const render = (over: Partial<Parameters<typeof invitationEmailHtml>[0]> = {}) =>
    invitationEmailHtml({
      agencyName: "Acme Agency",
      inviterEmail: "boss@acme.com",
      role: "member",
      inviteUrl: "https://tryreportflow.com/invite/tok123",
      expiryDays: 7,
      ...over,
    });

  it("contains a clickable accept link with the real token", () => {
    const html = render();
    expect(html).toContain('href="https://tryreportflow.com/invite/tok123"');
    expect(html).toContain("Accept invitation");
    // The raw URL is also shown as text, for clients that strip buttons.
    expect(html.split("https://tryreportflow.com/invite/tok123").length).toBeGreaterThan(2);
  });

  it("names the agency and the inviter", () => {
    const html = render();
    expect(html).toContain("Acme Agency");
    expect(html).toContain("boss@acme.com");
  });

  it("states the expiry so the link doesn't look permanent", () => {
    expect(render()).toContain("expires in 7 days");
  });

  it("escapes HTML in the agency name", () => {
    const html = render({ agencyName: 'Acme & <script>alert(1)</script>' });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
  });

  it("refuses a non-http invite URL instead of emitting it", () => {
    // safeUrl() returns null for anything that isn't http(s), so a poisoned
    // APP_URL can't become a javascript: link in someone's inbox.
    const html = render({ inviteUrl: "javascript:alert(1)" });
    expect(html).not.toContain("javascript:alert(1)");
    expect(html).toContain("could not be generated");
  });

  it("mentions admin capability only for admin invites", () => {
    expect(render({ role: "admin" })).toContain("Manage workspace settings");
    expect(render({ role: "member" })).not.toContain("Manage workspace settings");
  });

  it("still renders without an inviter address", () => {
    const html = render({ inviterEmail: null });
    expect(html).toContain("You've been invited");
    expect(html).not.toContain("null has invited");
    expect(html).toContain("Acme Agency");
  });
});

describe("safeNext — open-redirect guard on the invite return path", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/invite/abc")).toBe("/invite/abc");
    expect(safeNext("/dashboard/billing?plan=pro")).toBe("/dashboard/billing?plan=pro");
  });

  it("rejects anything that would leave the site", () => {
    for (const evil of ["https://evil.example", "//evil.example", "http://x", "/\\evil.example", "javascript:alert(1)"]) {
      expect(safeNext(evil)).toBe("/dashboard");
    }
  });

  it("falls back when absent", () => {
    expect(safeNext(null)).toBe("/dashboard");
    expect(safeNext(undefined)).toBe("/dashboard");
    expect(safeNext("")).toBe("/dashboard");
  });
});
