import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: () => ({ get: () => undefined, delete: () => {} }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => { throw new Error("tests inject the client"); } }));

import { attachReferral } from "./attach";

// The referral is attached when the agency is created — once, never for a
// paused or unknown code, never to the affiliate themself, and never at the
// cost of signup.

type Affiliate = { id: string; email: string; status: string };

function fakeAdmin(opts: { affiliate?: Affiliate | null; upsertError?: string; lookupThrows?: boolean } = {}) {
  const upserts: { table: string; row: unknown; options: unknown }[] = [];
  const client = {
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => {
          if (opts.lookupThrows) throw new Error("db down");
          return { data: opts.affiliate ?? null, error: null };
        },
        upsert: async (row: unknown, options: unknown) => {
          upserts.push({ table, row, options });
          return { error: opts.upsertError ? { message: opts.upsertError } : null };
        },
      };
      return chain;
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { admin: client as any, upserts };
}

const ACTIVE: Affiliate = { id: "aff1", email: "creator@example.com", status: "active" };

describe("attachReferral", () => {
  it("links the agency to an active affiliate, first touch wins", async () => {
    const f = fakeAdmin({ affiliate: ACTIVE });
    expect(await attachReferral("ag1", "new@agency.com", { admin: f.admin, cookieValue: "creator:/pricing" })).toBe("attached");
    expect(f.upserts).toEqual([
      {
        table: "referrals",
        row: { agency_id: "ag1", affiliate_id: "aff1", landing_path: "/pricing" },
        options: { onConflict: "agency_id", ignoreDuplicates: true },
      },
    ]);
  });

  it("does nothing without a cookie, or with a malformed one", async () => {
    const f = fakeAdmin({ affiliate: ACTIVE });
    expect(await attachReferral("ag1", "x@y.com", { admin: f.admin, cookieValue: null })).toBe("no_cookie");
    expect(await attachReferral("ag1", "x@y.com", { admin: f.admin, cookieValue: "NOT VALID" })).toBe("no_cookie");
    expect(f.upserts).toEqual([]);
  });

  it("does nothing for an unknown code or a paused affiliate", async () => {
    const unknown = fakeAdmin({ affiliate: null });
    expect(await attachReferral("ag1", "x@y.com", { admin: unknown.admin, cookieValue: "nobody" })).toBe("unknown_code");
    const paused = fakeAdmin({ affiliate: { ...ACTIVE, status: "paused" } });
    expect(await attachReferral("ag1", "x@y.com", { admin: paused.admin, cookieValue: "creator" })).toBe("paused");
    expect([...unknown.upserts, ...paused.upserts]).toEqual([]);
  });

  it("refuses a self-referral", async () => {
    const f = fakeAdmin({ affiliate: ACTIVE });
    expect(await attachReferral("ag1", "Creator@Example.com", { admin: f.admin, cookieValue: "creator" })).toBe("self_referral");
    expect(f.upserts).toEqual([]);
  });

  it("never throws, whatever the database does", async () => {
    expect(await attachReferral("ag1", "x@y.com", { admin: fakeAdmin({ lookupThrows: true }).admin, cookieValue: "creator" })).toBe("failed");
    expect(await attachReferral("ag1", "x@y.com", { admin: fakeAdmin({ affiliate: ACTIVE, upsertError: "boom" }).admin, cookieValue: "creator" })).toBe("failed");
  });
});
