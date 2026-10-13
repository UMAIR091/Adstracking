// The affiliate tables have no tenant grants (migration 0043): RLS on, no
// policies, revoke all from anon and authenticated. Every write must
// therefore go through the service role — a session-client write would fail
// with a permission error in production. These pin which client writes, along
// the three paths that touch the tables: signup attach, the Paddle webhook,
// and the admin actions. In the style of app/api/billing/serviceRoleWrites.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { memoryDb } from "./memoryDb";

const AFFILIATE_TABLES = new Set(["affiliates", "referrals", "affiliate_commissions"]);

let tenant: ReturnType<typeof memoryDb>;
let admin: ReturnType<typeof memoryDb>;
let isAdmin = true;
let refCookie: string | undefined;

function fresh() {
  tenant = memoryDb({}, { label: "tenant" });
  admin = memoryDb(
    {
      affiliates: [{ id: "aff1", code: "creator", email: "creator@example.com", status: "active", commission_pct: "25", commission_type: "recurring", recurring_months: null }],
      referrals: [],
      affiliate_commissions: [],
      subscriptions: [],
    },
    {
      label: "admin",
      defaults: { affiliate_commissions: { refunded_net_minor: 0, applied_adjustment_ids: [], clawback_needed: false, note: null, reversed_at: null } },
    }
  );
}

vi.mock("next/headers", () => ({
  cookies: () => ({ get: () => (refCookie ? { value: refCookie } : undefined), delete: () => {} }),
  headers: () => new Headers(),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => tenant.client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin.client }));
vi.mock("@/lib/admin", () => ({ requirePlatformAdmin: async () => (isAdmin ? { id: "owner", email: "owner@example.com" } : null) }));
vi.mock("@/lib/monitoring", () => ({ captureException: () => {} }));
vi.mock("@/lib/metaCapi", () => ({ reportFirstPurchase: async () => {} }));
vi.mock("@/lib/analyticsServer", () => ({ captureServer: async () => {} }));
vi.mock("@/lib/email", () => ({ emailConfigured: () => false, sendEmailWithRetry: async () => ({}), welcomeEmailHtml: () => "" }));
vi.mock("@/lib/billing/trial", () => ({ recordTrialGrant: async () => {} }));

let event: unknown;
vi.mock("@/lib/billing/paddle", () => ({
  webhookConfigured: () => true,
  verifyWebhook: async () => event,
  readSubscription: () => ({}),
}));

let attachReferral: typeof import("./attach").attachReferral;
let webhook: (req: Request) => Promise<Response>;
let actions: typeof import("@/app/dashboard/admin/affiliates/actions");
beforeAll(async () => {
  ({ attachReferral } = await import("./attach"));
  ({ POST: webhook } = await import("@/app/api/webhooks/paddle/route"));
  actions = await import("@/app/dashboard/admin/affiliates/actions");
});

beforeEach(() => {
  fresh();
  isAdmin = true;
  refCookie = undefined;
});

const affiliateWrites = (m: ReturnType<typeof memoryDb>) => m.writes.filter((w) => AFFILIATE_TABLES.has(w.table));

describe("affiliate tables are written only with the service role", () => {
  it("signup attach", async () => {
    refCookie = "creator:/";
    expect(await attachReferral("ag1", "new@agency.com")).toBe("attached");
    expect(affiliateWrites(admin).map((w) => w.table)).toEqual(["referrals"]);
    expect(affiliateWrites(tenant)).toEqual([]);
  });

  it("the Paddle webhook's commission", async () => {
    admin.db.referrals.push({ agency_id: "ag1", affiliate_id: "aff1", first_paid_at: null, first_transaction_id: null });
    event = {
      eventType: "transaction.completed",
      data: {
        id: "txn_1", customerId: "ctm_1", subscriptionId: "sub_1", items: [], customData: { agency_id: "ag1" },
        currencyCode: "USD", billedAt: "2026-10-01T00:00:00Z", details: { totals: { subtotal: "4900", discount: "0", total: "4900" } },
      },
    };
    const res = await webhook(new Request("https://x/api/webhooks/paddle", { method: "POST", body: "{}", headers: { "paddle-signature": "s" } }));
    expect(res.status).toBe(200);
    expect(admin.db.affiliate_commissions).toHaveLength(1);
    expect(admin.db.affiliate_commissions[0]).toMatchObject({ commission_amount_minor: 1225, net_amount_minor: 4900 });
    expect(affiliateWrites(tenant)).toEqual([]);
  });

  it("the webhook still succeeds when the commission step can't write", async () => {
    admin.db.referrals.push({ agency_id: "ag1", affiliate_id: "aff1", first_paid_at: null, first_transaction_id: null });
    const realFrom = admin.client.from;
    admin.client.from = (t: string) => {
      if (t === "affiliate_commissions") throw new Error("table missing");
      return realFrom(t);
    };
    event = {
      eventType: "transaction.completed",
      data: { id: "txn_9", customerId: "c", subscriptionId: "sub_1", items: [], customData: { agency_id: "ag1" }, currencyCode: "USD", details: { totals: { subtotal: "4900", discount: "0" } } },
    };
    const res = await webhook(new Request("https://x/api/webhooks/paddle", { method: "POST", body: "{}", headers: { "paddle-signature": "s" } }));
    expect(res.status).toBe(200);
    expect(admin.db.subscriptions).toHaveLength(1);
  });

  it("refund adjustments through the webhook", async () => {
    admin.db.affiliate_commissions.push({
      id: "c1", paddle_transaction_id: "txn_1", currency: "USD", status: "pending", net_amount_minor: 4900, commission_pct: 25,
      commission_amount_minor: 1225, refunded_net_minor: 0, clawback_needed: false, applied_adjustment_ids: [], note: null, reversed_at: null,
    });
    event = { eventType: "adjustment.updated", data: { id: "adj_1", action: "refund", type: "full", status: "approved", transactionId: "txn_1", totals: { subtotal: "4900" } } };
    const res = await webhook(new Request("https://x/api/webhooks/paddle", { method: "POST", body: "{}", headers: { "paddle-signature": "s" } }));
    expect(res.status).toBe(200);
    expect(admin.db.affiliate_commissions[0].status).toBe("reversed");
    expect(affiliateWrites(tenant)).toEqual([]);
  });

  it("admin actions", async () => {
    const created = await actions.saveAffiliateAction(null, {
      code: "second", name: "Second", email: "s@example.com", status: "active", commissionPct: "10", commissionType: "first_payment",
    });
    expect(created.ok).toBe(true);
    await actions.setAffiliateStatusAction("aff1", "paused");
    admin.db.affiliate_commissions.push({ id: "c1", affiliate_id: "aff1", status: "pending", payable_after: "2020-01-01T00:00:00Z" });
    const paid = await actions.markCommissionsPaidAction("aff1", ["c1"], "PAYONEER-123");
    expect(paid).toEqual({ ok: true, count: 1 });
    expect(admin.db.affiliate_commissions[0]).toMatchObject({ status: "paid", payout_reference: "PAYONEER-123" });
    expect(affiliateWrites(tenant)).toEqual([]);
  });

  it("admin actions refuse anyone who isn't a platform admin, writing nothing", async () => {
    isAdmin = false;
    expect(await actions.setAffiliateStatusAction("aff1", "paused")).toEqual({ ok: false, error: "Not found." });
    expect(await actions.markCommissionsPaidAction("aff1", ["c1"], "ref")).toEqual({ ok: false, error: "Not found." });
    expect(affiliateWrites(admin)).toEqual([]);
  });

  it("mark-paid never touches a commission still in its hold", async () => {
    admin.db.affiliate_commissions.push({ id: "c2", affiliate_id: "aff1", status: "pending", payable_after: "2999-01-01T00:00:00Z" });
    expect(await actions.markCommissionsPaidAction("aff1", ["c2"], "ref")).toEqual({ ok: true, count: 0 });
    expect(admin.db.affiliate_commissions[0].status).toBe("pending");
  });
});
