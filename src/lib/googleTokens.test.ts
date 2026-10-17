import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// Long-lived tokens that renew themselves only while still valid (Business
// Login for Instagram) used to be renewed in the last minute before expiry, so
// a once-a-day sync found them already expired and the connection died. These
// pin the early renewal, and that it stays best-effort.

const refresh = vi.fn();
// Set to make the next renewal fail. A plain throw rather than a vi.fn()
// implementation: Vitest reports an error thrown by a mock as a test failure
// even after the code under test has caught it.
let failRenewal: Error | null = null;
const renew = async (...args: unknown[]) => {
  if (failRenewal) throw failRenewal;
  return refresh(...args);
};
vi.mock("@/lib/crypto", () => ({
  encrypt: (s: string) => `enc:${s}`,
  decrypt: (s: string) => s.replace(/^enc:/, ""),
}));
vi.mock("@/lib/google", () => ({ refreshAccessToken: vi.fn() }));
// Shared sign-ins are read and written with the service role.
const admin = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin.db }));
vi.mock("@/lib/integrations/registry", () => ({
  oauthForType: (type: string) =>
    type === "instagram"
      ? { refresh: renew, renewal: (ctx?: { provider?: string }) => (ctx?.provider === "instagram" ? "extend" : "reconnect") }
      : { refresh: renew },
}));

import { getValidAccessToken } from "./googleTokens";

const DAY = 24 * 60 * 60 * 1000;
type Row = Record<string, unknown> & { id: string };

// Just enough of the Supabase query builder for googleTokens: the lease update
// (…maybeSingle), the token re-read (select…maybeSingle) and plain updates.
function fakeDb(row: Row) {
  const writes: Record<string, unknown>[] = [];
  const from = (table: string) => {
    let op: "select" | "update" = "select";
    let payload: Record<string, unknown> = {};
    const b = {
      update(p: Record<string, unknown>) { op = "update"; payload = p; return b; },
      select() { return b; },
      eq() { return b; },
      or() { return b; },
      maybeSingle: async () => ({ data: op === "update" ? { id: row.id } : { ...row } }),
      then(resolve: (v: unknown) => unknown) {
        if (op === "update") {
          writes.push({ table, ...payload });
          if (payload.access_token) Object.assign(row, payload);
        }
        return Promise.resolve({ data: null, error: null }).then(resolve);
      },
    };
    return b;
  };
  return { db: { from } as unknown as SupabaseClient, writes };
}

const source = (type: string, daysLeft: number, provider?: string): Row => ({
  id: "ds1",
  type,
  config: provider ? { identity_provider: provider } : {},
  access_token: "enc:current",
  refresh_token: "enc:current",
  token_expires_at: new Date(Date.now() + daysLeft * DAY).toISOString(),
});

beforeEach(() => {
  refresh.mockReset();
  failRenewal = null;
});

describe("early renewal of self-extending tokens", () => {
  it("renews an Instagram sign-in token once fewer than 10 days are left", async () => {
    refresh.mockResolvedValue({ access_token: "renewed", refresh_token: "renewed", expires_in: 60 * 86400 });
    const row = source("instagram", 5, "instagram");
    const { db, writes } = fakeDb(row);
    expect(await getValidAccessToken(db, row as never)).toBe("renewed");
    expect(refresh).toHaveBeenCalledWith("current", { provider: "instagram" });
    const saved = writes.find((w) => w.access_token);
    expect(saved?.access_token).toBe("enc:renewed");
    expect(new Date(saved?.token_expires_at as string).getTime()).toBeGreaterThan(Date.now() + 59 * DAY);
  });

  it("leaves it alone while more than 10 days are left", async () => {
    const row = source("instagram", 20, "instagram");
    expect(await getValidAccessToken(fakeDb(row).db, row as never)).toBe("current");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("keeps using the current token when an early renewal fails", async () => {
    failRenewal = new Error("Instagram API error: temporarily unavailable");
    const row = source("instagram", 5, "instagram");
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await getValidAccessToken(fakeDb(row).db, row as never)).toBe("current");
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });
});

describe("other tokens are unchanged", () => {
  it("doesn't touch a Facebook sign-in token early (it can't be extended)", async () => {
    const row = source("instagram", 5);
    expect(await getValidAccessToken(fakeDb(row).db, row as never)).toBe("current");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("still refreshes an expired refresh-token connection, and still fails loudly", async () => {
    refresh.mockResolvedValueOnce({ access_token: "fresh", expires_in: 3600 });
    const row = source("gsc", -0.01);
    expect(await getValidAccessToken(fakeDb(row).db, row as never)).toBe("fresh");

    failRenewal = new Error("invalid_grant");
    const dead = source("gsc", -0.01);
    await expect(getValidAccessToken(fakeDb(dead).db, dead as never)).rejects.toThrow("invalid_grant");
  });
});

describe("shared sign-ins (migration 0046)", () => {
  it("refreshes the sign-in, not the client's row, so every client gets the new token", async () => {
    refresh.mockResolvedValue({ access_token: "renewed", refresh_token: "renewed", expires_in: 60 * 86400 });
    const signIn = {
      id: "conn1",
      identity_provider: "instagram",
      access_token: "enc:shared",
      refresh_token: "enc:shared",
      token_expires_at: new Date(Date.now() + 5 * DAY).toISOString(),
    };
    const shared = fakeDb(signIn);
    admin.db = shared.db;
    const row = { ...source("instagram", 30), access_token: null, refresh_token: null, token_expires_at: null, config: {}, connection: signIn };
    const own = fakeDb(row);

    expect(await getValidAccessToken(own.db, row as never)).toBe("renewed");
    // The sign-in route comes from the sign-in; the client row records none.
    expect(refresh).toHaveBeenCalledWith("shared", { provider: "instagram" });
    expect(shared.writes.filter((w) => w.access_token).map((w) => w.table)).toEqual(["connections"]);
    expect(own.writes).toEqual([]);
  });
});
