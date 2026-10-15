import { describe, expect, it } from "vitest";
import { buildGenClients, sourceNote } from "./genClients";

const t = "2026-10-15T06:00:00Z";

describe("buildGenClients", () => {
  const clients = [
    { id: "a", name: "Acme", email: "a@acme.test" },
    { id: "b", name: "Bloom", email: null },
    { id: "c", name: "Northside", email: null },
  ];
  const rows = [
    { clientId: "a", type: "gsc", providerName: "Search Console", health: "healthy" as const, lastSyncedAt: t },
    { clientId: "a", type: "ga4", providerName: "GA4", health: "needs_reconnect" as const, lastSyncedAt: t },
    { clientId: "b", type: "meta_ads", providerName: "Meta Ads", health: "needs_account" as const, lastSyncedAt: null },
  ];
  const out = buildGenClients(clients, rows);

  it("offers a client once a source has synced data", () => {
    expect(out.find((c) => c.id === "a")?.ready).toBe(true);
  });

  it("doesn't offer a client whose only source has no account chosen, or no sources", () => {
    expect(out.find((c) => c.id === "b")?.ready).toBe(false);
    expect(out.find((c) => c.id === "c")?.ready).toBe(false);
  });

  it("notes sources that may be stale instead of claiming they're skipped", () => {
    expect(out.find((c) => c.id === "a")?.sources).toEqual([
      { type: "gsc", name: "Search Console", note: null },
      { type: "ga4", name: "GA4", note: "needs reconnecting, may be out of date" },
    ]);
  });
});

describe("sourceNote", () => {
  it("says a source without an account won't contribute", () => {
    expect(sourceNote("needs_account", null)).toBe("no account selected, not included");
  });
  it("flags a never-synced healthy source", () => {
    expect(sourceNote("healthy", null)).toBe("waiting for first sync");
  });
});
