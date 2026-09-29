import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { reportFirstPurchase } from "./metaCapi";
import { pixelAllowedOnPath } from "./metaPixel";

describe("pixelAllowedOnPath", () => {
  it("allows the marketing funnel", () => {
    for (const p of ["/", "/pricing", "/sample-report", "/signup", "/help/connect-ga4", "/dashboard/billing"]) {
      expect(pixelAllowedOnPath(p)).toBe(true);
    }
  });

  it("never allows client reports, the rest of the dashboard or onboarding", () => {
    for (const p of ["/r/abc123", "/dashboard", "/dashboard/clients", "/dashboard/billingx", "/onboarding", "/login"]) {
      expect(pixelAllowedOnPath(p)).toBe(false);
    }
  });
});

// A minimal stand-in for the admin client: the claim update returns `claimRow`
// once, then nothing (as the real `purchase_sent_at is null` filter would).
function fakeAdmin(claimRow: Record<string, unknown> | null) {
  let claimed = false;
  const updates: Record<string, unknown>[] = [];
  const chain = (result: () => unknown) => {
    const q: Record<string, unknown> = {};
    for (const m of ["eq", "is", "select", "lt", "delete"]) q[m] = () => q;
    q.maybeSingle = async () => result();
    q.then = (resolve: (v: unknown) => void) => resolve({ error: null });
    return q;
  };
  const admin = {
    from: (table: string) => ({
      update: (values: Record<string, unknown>) => {
        updates.push(values);
        return chain(() => {
          if (!("purchase_sent_at" in values)) return { data: null, error: null };
          if (claimed || !claimRow) return { data: null, error: null };
          claimed = true;
          return { data: claimRow, error: null };
        });
      },
      select: () =>
        chain(() =>
          table === "agencies" ? { data: { owner_id: "owner-1", contact_email: "Hi@Agency.test " }, error: null } : { data: null }
        ),
    }),
    auth: { admin: { getUserById: async () => ({ data: { user: { email: "owner@agency.test" } } }) } },
  };
  return { admin: admin as unknown as SupabaseClient, updates };
}

describe("reportFirstPurchase", () => {
  const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

  beforeEach(() => {
    vi.stubEnv("META_CAPI_TOKEN", "test-token");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockClear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const row = { fbp: "fb.1.1.2", fbc: null, client_ip: "1.2.3.4", user_agent: "UA" };

  it("sends one Purchase for the first real payment, in major units, deduplicated on the transaction id", async () => {
    const { admin, updates } = fakeAdmin(row);
    await reportFirstPurchase(admin, { agencyId: "a1", transactionId: "txn_1", total: "4900", currency: "usd" });
    await reportFirstPurchase(admin, { agencyId: "a1", transactionId: "txn_2", total: "4900", currency: "usd" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    const event = body.data[0];
    expect(event.event_name).toBe("Purchase");
    expect(event.event_id).toBe("txn_1");
    expect(event.custom_data).toEqual({ value: 49, currency: "USD" });
    expect(event.user_data.em).toHaveLength(2);
    expect(event.user_data.em[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(event.user_data.fbp).toBe("fb.1.1.2");
    // The identifiers are cleared once sent.
    expect(updates).toContainEqual({ fbp: null, fbc: null, client_ip: null, user_agent: null });
  });

  it("skips a zero-value trial checkout", async () => {
    const { admin } = fakeAdmin(row);
    await reportFirstPurchase(admin, { agencyId: "a1", transactionId: "txn_0", total: "0", currency: "USD" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips agencies with no attribution (the pixel never ran for them)", async () => {
    const { admin } = fakeAdmin(null);
    await reportFirstPurchase(admin, { agencyId: "a1", transactionId: "txn_1", total: "4900", currency: "USD" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing without a token", async () => {
    vi.stubEnv("META_CAPI_TOKEN", "");
    const { admin } = fakeAdmin(row);
    await reportFirstPurchase(admin, { agencyId: "a1", transactionId: "txn_1", total: "4900", currency: "USD" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
