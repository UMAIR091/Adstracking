// Disconnecting one Google integration must not break the others.
//
// Google issues ONE grant per (OAuth client, Google account) and
// `include_granted_scopes` accumulates every product's scopes into it, so one
// account's Search Console, GA4, Google Ads, Business Profile, Sheets, BigQuery
// and Google-signed-in Microsoft Ads connections all sit on a single grant.
// Revocation is grant-wide. Revoking on every disconnect therefore killed every
// sibling connection silently — the row the user asked to remove disappeared,
// and the ones they kept started failing with invalid_grant at the next sync,
// with nothing to connect the two events.
//
// These tests pin both halves: a shared grant survives, a last-one-out grant is
// still revoked.
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

const revokeGoogleToken = vi.fn(async (_token: string) => {});
const revalidateIntegrationHealth = vi.fn();

// Everything else in lib/google stays real, so the registry wiring under test
// (gsc/ga4/google_ads → googleOAuth → grantKey) is the genuine article.
vi.mock("@/lib/google", async () => ({
  ...((await vi.importActual("@/lib/google")) as Record<string, unknown>),
  revokeGoogleToken: (t: string) => revokeGoogleToken(t),
}));
vi.mock("@/lib/crypto", () => ({
  decrypt: (v: string) => String(v).replace(/^enc:/, ""),
  encrypt: (v: string) => `enc:${v}`,
}));
vi.mock("@/lib/integrationHealth", () => ({
  revalidateIntegrationHealth: (id: string) => revalidateIntegrationHealth(id),
}));

type Row = {
  id: string;
  type: string;
  agency_id: string;
  access_token: string | null;
  refresh_token: string | null;
  display_name: string | null;
  config: Record<string, unknown> | null;
};

const deleted: string[] = [];
let target: Row | null = null;
let siblings: Row[] = [];

// Minimal stand-in for the query builder the route uses: `.select().eq().maybeSingle()`
// for the target row, `.select().eq().neq()` awaited directly for siblings, and
// `.delete().eq()` for the removal.
function builder(op: "select" | "delete") {
  const chain = {
    select: () => chain,
    eq: (col: string, val: string) => {
      if (op === "delete" && col === "id") deleted.push(val);
      return chain;
    },
    neq: () => chain,
    maybeSingle: async () => ({ data: target }),
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(op === "delete" ? { error: null } : { data: siblings }).then(res, rej),
  };
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from: () => ({ select: () => builder("select"), delete: () => builder("delete") }),
  }),
}));

let POST: (req: Request) => Promise<Response>;
beforeAll(async () => {
  ({ POST } = await import("./route"));
});

const AGENCY = "agency-1";
const ACCOUNT = "owner@example.com";

const source = (over: Partial<Row> & Pick<Row, "id" | "type">): Row => ({
  agency_id: AGENCY,
  access_token: "enc:access-tok",
  refresh_token: "enc:refresh-tok",
  display_name: ACCOUNT,
  config: null,
  ...over,
});

const disconnect = (id: string) =>
  POST(new Request("https://example.com/api/google/disconnect", {
    method: "POST",
    body: JSON.stringify({ dataSourceId: id }),
  }));

beforeEach(() => {
  vi.clearAllMocks();
  deleted.length = 0;
  target = null;
  siblings = [];
});

describe("disconnect and the shared Google grant", () => {
  it("does NOT revoke when another Google connection shares the grant", async () => {
    target = source({ id: "ds-gsc", type: "gsc" });
    siblings = [source({ id: "ds-ga4", type: "ga4" })];

    const res = await disconnect("ds-gsc");

    expect(res.status).toBe(200);
    expect(revokeGoogleToken).not.toHaveBeenCalled();
    // The row the user asked to remove still goes.
    expect(deleted).toEqual(["ds-gsc"]);
  });

  it("leaves every other connection on that grant untouched", async () => {
    target = source({ id: "ds-gsc", type: "gsc" });
    siblings = [
      source({ id: "ds-ga4", type: "ga4" }),
      source({ id: "ds-ads", type: "google_ads" }),
    ];

    await disconnect("ds-gsc");

    // Nothing but the target is deleted, and the grant backing the survivors is
    // never revoked — so their stored tokens keep working.
    expect(deleted).toEqual(["ds-gsc"]);
    expect(deleted).not.toContain("ds-ga4");
    expect(deleted).not.toContain("ds-ads");
    expect(revokeGoogleToken).not.toHaveBeenCalled();
  });

  it("revokes when it is the last connection on the grant", async () => {
    target = source({ id: "ds-gsc", type: "gsc" });
    siblings = [];

    const res = await disconnect("ds-gsc");

    expect(res.status).toBe(200);
    expect(revokeGoogleToken).toHaveBeenCalledTimes(1);
    // Revoking the refresh token invalidates the whole grant, which is exactly
    // what's wanted once nothing is left on it.
    expect(revokeGoogleToken).toHaveBeenCalledWith("refresh-tok");
    expect(deleted).toEqual(["ds-gsc"]);
  });

  it("still revokes when the only other connection is a different Google account", async () => {
    target = source({ id: "ds-gsc", type: "gsc" });
    siblings = [source({ id: "ds-ga4", type: "ga4", display_name: "someone-else@example.com" })];

    await disconnect("ds-gsc");

    // A separate account is a separate grant — leaving it would strand a grant
    // the user believes they disconnected.
    expect(revokeGoogleToken).toHaveBeenCalledTimes(1);
  });

  it("still revokes when the only other connection is on a different provider", async () => {
    target = source({ id: "ds-gsc", type: "gsc" });
    siblings = [source({ id: "ds-meta", type: "meta_ads", display_name: "Some Page" })];

    await disconnect("ds-gsc");

    expect(revokeGoogleToken).toHaveBeenCalledTimes(1);
  });

  it("counts a Google-signed-in Microsoft Ads connection as sharing the grant", async () => {
    target = source({ id: "ds-gsc", type: "gsc" });
    siblings = [
      source({ id: "ds-msads", type: "microsoft_ads", config: { identity_provider: "google" } }),
    ];

    await disconnect("ds-gsc");

    // That connection was minted by the same Google OAuth app, so revoking here
    // would break it even though it isn't a "Google integration" by name.
    expect(revokeGoogleToken).not.toHaveBeenCalled();
    expect(deleted).toEqual(["ds-gsc"]);
  });

  it("does not count a Microsoft-signed-in Microsoft Ads connection", async () => {
    target = source({ id: "ds-gsc", type: "gsc" });
    siblings = [source({ id: "ds-msads", type: "microsoft_ads", config: null })];

    await disconnect("ds-gsc");

    // Its own grant, its own lifetime — it can't keep the Google grant alive.
    expect(revokeGoogleToken).toHaveBeenCalledTimes(1);
  });

  it("revokes when the grant cannot be identified, rather than stranding it", async () => {
    target = source({ id: "ds-gsc", type: "gsc", display_name: null });
    siblings = [source({ id: "ds-ga4", type: "ga4", display_name: null })];

    await disconnect("ds-gsc");

    // Without an account to key on, two rows can't be shown to share a grant.
    // Revoking is the safer default: an orphaned grant is a hygiene problem, a
    // wrongly-kept one is a privacy one.
    expect(revokeGoogleToken).toHaveBeenCalledTimes(1);
  });

  it("deletes the row even when revocation throws", async () => {
    target = source({ id: "ds-gsc", type: "gsc" });
    siblings = [];
    revokeGoogleToken.mockRejectedValueOnce(new Error("google is down"));

    const res = await disconnect("ds-gsc");

    expect(res.status).toBe(200);
    expect(deleted).toEqual(["ds-gsc"]);
  });
});
