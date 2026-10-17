import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// Client connect links (migration 0048). The client has no Anavyst session, so
// the link is the whole authorization: these pin what makes one valid and
// which platforms a client may connect through it.

vi.hoisted(() => {
  process.env.META_APP_ID = "fb-app";
  process.env.META_APP_SECRET = "fb-secret";
  process.env.META_OAUTH_REDIRECT_URI = "https://tryreportflow.com/api/meta/callback";
  process.env.INSTAGRAM_APP_ID = "ig-app";
  process.env.INSTAGRAM_APP_SECRET = "ig-secret";
  delete process.env.LIVE_INTEGRATIONS;
});

import {
  hashLinkToken, isLinkToken, linkConnectable, linkSignInOptions, loadConnectLink, newLinkToken,
} from "./connectLinks";
import { getIntegration } from "@/lib/integrations/registry";

const NOW = Date.UTC(2026, 9, 17, 12);

function fakeAdmin(row: unknown) {
  let hash: unknown;
  const db = {
    from: () => {
      const b = {
        select: () => b,
        eq: (_k: string, v: unknown) => { hash = v; return b; },
        maybeSingle: async () => ({ data: row }),
      };
      return b;
    },
  };
  return { db: db as unknown as SupabaseClient, hash: () => hash };
}

const row = (over: Record<string, unknown> = {}) => ({
  id: "link-1",
  agency_id: "ag-1",
  client_id: "c-1",
  types: ["meta_ads", "instagram", "shopify"],
  expires_at: new Date(NOW + 3 * 86400000).toISOString(),
  revoked_at: null,
  agencies: { name: "Bright Agency", logo_url: null, brand_color: "#4F46E5" },
  clients: { name: "Acme", archived: false },
  ...over,
});

describe("tokens", () => {
  it("are 256-bit base64url, and only their hash is looked up", async () => {
    const token = newLinkToken();
    expect(isLinkToken(token)).toBe(true);
    expect(hashLinkToken(token)).toMatch(/^[0-9a-f]{64}$/);
    const admin = fakeAdmin(row());
    await loadConnectLink(admin.db, token, NOW);
    expect(admin.hash()).toBe(hashLinkToken(token));
  });

  it("rejects malformed tokens without a lookup", async () => {
    const admin = fakeAdmin(row());
    expect(await loadConnectLink(admin.db, "short", NOW)).toEqual({ ok: false, reason: "unknown" });
    expect(admin.hash()).toBeUndefined();
  });
});

describe("loadConnectLink", () => {
  const token = newLinkToken();

  it("returns a valid link with the agency's branding, keeping only link-connectable platforms", async () => {
    const found = await loadConnectLink(fakeAdmin(row()).db, token, NOW);
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.link).toMatchObject({ clientId: "c-1", clientName: "Acme", agency: { name: "Bright Agency" } });
    // Shopify needs a store first, so it can't be done from a link.
    expect(found.link.types).toEqual(["meta_ads", "instagram"]);
  });

  it("refuses expired, revoked and archived-client links, naming the agency", async () => {
    const expired = await loadConnectLink(fakeAdmin(row({ expires_at: new Date(NOW - 1).toISOString() })).db, token, NOW);
    expect(expired).toMatchObject({ ok: false, reason: "expired", agency: { name: "Bright Agency" } });
    const revoked = await loadConnectLink(fakeAdmin(row({ revoked_at: new Date(NOW).toISOString() })).db, token, NOW);
    expect(revoked).toMatchObject({ ok: false, reason: "revoked" });
    const archived = await loadConnectLink(fakeAdmin(row({ clients: { name: "Acme", archived: true } })).db, token, NOW);
    expect(archived).toMatchObject({ ok: false, reason: "archived" });
    expect(await loadConnectLink(fakeAdmin(null).db, token, NOW)).toEqual({ ok: false, reason: "unknown" });
  });
});

describe("what a link can connect", () => {
  it("allows OAuth sign-in platforms, not API keys, store/sheet platforms or X", () => {
    expect(linkConnectable(getIntegration("meta_ads"))).toBe(true);
    expect(linkConnectable(getIntegration("instagram"))).toBe(true);
    expect(linkConnectable(getIntegration("shopify"))).toBe(false);
    expect(linkConnectable(getIntegration("sheets"))).toBe(false);
    expect(linkConnectable(getIntegration("klaviyo"))).toBe(false);
    expect(linkConnectable(getIntegration("x_ads"))).toBe(false);
  });

  it("never offers admin-only sign-ins to a client (Instagram sign-in before Meta approves it)", () => {
    expect(linkSignInOptions(getIntegration("instagram")!).map((p) => p.id)).toEqual(["facebook"]);
  });
});
