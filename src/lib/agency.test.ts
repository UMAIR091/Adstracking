import { beforeEach, describe, expect, it, vi } from "vitest";

// A fake Supabase client that behaves like production RLS for a brand-new user:
// a plain insert into agencies works, but insert-and-return (.select()) fails,
// because the "members read agency" policy can't see the row the same statement
// inserted. Every signup from 26 Jul to 15 Oct 2026 hit that and got no agency.

type Row = Record<string, unknown>;
const USER = { id: "user-1", email: "new@agency.test" };

let agencies: Row[];
let insertConflict: boolean;
const attachReferral = vi.fn(async () => "attached");

function fakeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: USER } }) },
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      const visible = () =>
        // RLS: a user only sees agencies they own (no memberships yet).
        agencies.filter((a) => a.owner_id === USER.id && filters.every(([k, v]) => a[k] === v));
      const reader = {
        select: () => reader,
        eq: (k: string, v: unknown) => (filters.push([k, v]), reader),
        order: () => reader,
        limit: () => reader,
        maybeSingle: async () => ({ data: visible()[0] ?? null, error: null }),
        single: async () => ({ data: visible()[0] ?? null, error: null }),
      };
      return {
        ...reader,
        upsert: async () => ({ error: null }),
        insert(row: Row) {
          const doInsert = () => {
            if (table !== "agencies") return { error: null };
            if (insertConflict) return { error: { code: "23505", message: "duplicate key value violates unique constraint \"agencies_owner_id_key\"" } };
            agencies.push({ id: "agency-1", onboarding_completed_at: null, ...row });
            return { error: null };
          };
          return {
            then: (resolve: (v: unknown) => void) => resolve(doInsert()),
            select: () => ({
              single: async () => ({
                data: null,
                error: { code: "42501", message: 'new row violates row-level security policy for table "agencies"' },
              }),
            }),
          };
        },
      };
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: () => fakeClient() }));
vi.mock("@/lib/affiliates/attach", () => ({ attachReferral: (...a: unknown[]) => attachReferral(...(a as [])) }));

import { getCurrentUserAndAgency } from "./agency";

beforeEach(() => {
  agencies = [];
  insertConflict = false;
  attachReferral.mockClear();
});

describe("first sign-in", () => {
  it("creates the user's agency and returns it as owner", async () => {
    const { agency, role } = await getCurrentUserAndAgency();
    expect(agency).toMatchObject({ id: "agency-1", owner_id: USER.id, name: "My Agency", contact_email: USER.email });
    expect(role).toBe("owner");
    expect(agencies).toHaveLength(1);
    expect(attachReferral).toHaveBeenCalledWith("agency-1", USER.email);
  });

  it("returns the agency a parallel first request created, without attaching the referral twice", async () => {
    agencies = [{ id: "agency-0", owner_id: USER.id, name: "My Agency", onboarding_completed_at: null }];
    insertConflict = true;
    // Simulate the race: the owner lookup missed, then the other request's insert landed.
    const realOwned = agencies.splice(0);
    const client = fakeClient();
    const from = client.from.bind(client);
    let lookups = 0;
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: () => ({
        ...client,
        from: (t: string) => {
          if (t === "agencies" && ++lookups === 3) agencies.push(...realOwned);
          return from(t);
        },
      }),
    }));
    vi.resetModules();
    const { getCurrentUserAndAgency: fresh } = await import("./agency");
    const { agency, role } = await fresh();
    expect(agency).toMatchObject({ id: "agency-0" });
    expect(role).toBe("owner");
    expect(attachReferral).not.toHaveBeenCalled();
    vi.doUnmock("@/lib/supabase/server");
  });

  it("returns the existing agency on later visits without inserting", async () => {
    agencies = [{ id: "agency-9", owner_id: USER.id, name: "Acme", onboarding_completed_at: "2026-10-01" }];
    const { agency } = await getCurrentUserAndAgency();
    expect(agency).toMatchObject({ id: "agency-9", name: "Acme" });
    expect(agencies).toHaveLength(1);
    expect(attachReferral).not.toHaveBeenCalled();
  });
});
