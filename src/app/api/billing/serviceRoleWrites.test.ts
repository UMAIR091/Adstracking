// Tenants can read their subscription row but no longer write it (migration
// 0038) — that write access was how a browser could grant itself any plan.
// The three billing routes that mirror Paddle into the row therefore have to
// write with the service role. If one of them still used the session client,
// activation after checkout, cancellation or reconciliation would fail with a
// permission error in production, so these tests pin which client writes.
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

type Op = { client: "tenant" | "admin"; table: string; op: string; payload?: unknown; filters: [string, unknown][] };
const ops: Op[] = [];
let tenantSub: Record<string, unknown> | null = null;
let adminExisting: { id: string } | null = null;

// One builder for both clients; only write operations are recorded.
function fakeClient(kind: "tenant" | "admin") {
  return {
    from: (table: string) => {
      const entry: Op = { client: kind, table, op: "select", filters: [] };
      const write = (op: string) => (payload?: unknown) => {
        entry.op = op;
        entry.payload = payload;
        ops.push(entry);
        return chain;
      };
      const chain = {
        select: () => chain,
        update: write("update"),
        insert: write("insert"),
        upsert: write("upsert"),
        delete: write("delete"),
        eq: (col: string, val: unknown) => {
          entry.filters.push([col, val]);
          return chain;
        },
        maybeSingle: async () => ({ data: kind === "tenant" ? tenantSub : adminExisting }),
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
          Promise.resolve({ error: null }).then(res, rej),
      };
      return chain;
    },
  };
}

const paddle = {
  getTransactionFacts: vi.fn(),
  getSubscription: vi.fn(),
  readSubscription: vi.fn(),
  cancelSubscription: vi.fn(),
  resumeSubscription: vi.fn(),
  changeSubscriptionPrice: vi.fn(),
  createPortalUrl: vi.fn(),
};

vi.mock("@/lib/agency", () => ({
  getCurrentUserAndAgency: async () => ({ user: { id: "u1" }, agency: { id: "a1" } }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => fakeClient("tenant") }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeClient("admin") }));
vi.mock("@/lib/billing/paddle", () => ({
  getTransactionFacts: (...a: unknown[]) => paddle.getTransactionFacts(...a),
  getSubscription: (...a: unknown[]) => paddle.getSubscription(...a),
  readSubscription: (...a: unknown[]) => paddle.readSubscription(...a),
  cancelSubscription: (...a: unknown[]) => paddle.cancelSubscription(...a),
  resumeSubscription: (...a: unknown[]) => paddle.resumeSubscription(...a),
  changeSubscriptionPrice: (...a: unknown[]) => paddle.changeSubscriptionPrice(...a),
  createPortalUrl: (...a: unknown[]) => paddle.createPortalUrl(...a),
  PaddleError: class PaddleError extends Error {},
}));

let confirm: (req: Request) => Promise<Response>;
let manage: (req: Request) => Promise<Response>;
let portal: (req: Request) => Promise<Response>;
beforeAll(async () => {
  ({ POST: confirm } = await import("./confirm/route"));
  ({ POST: manage } = await import("./subscription/route"));
  ({ GET: portal } = await import("./portal/route"));
});

const subscriptionWrites = (client: Op["client"]) =>
  ops.filter((o) => o.client === client && o.table === "subscriptions");

const post = (path: string, body: unknown) =>
  new Request(`https://example.com${path}`, { method: "POST", body: JSON.stringify(body) });

const notFound = () => Object.assign(new Error("Not found"), { notFound: true, status: 404 });

beforeEach(() => {
  vi.clearAllMocks();
  ops.length = 0;
  tenantSub = { provider: "paddle", provider_subscription_id: "sub_1", provider_customer_id: "ctm_1", price_id: null, plan: "pro", status: "active" };
  adminExisting = { id: "s1" };
  paddle.getTransactionFacts.mockResolvedValue({ agencyId: "a1", subscriptionId: "sub_1", customerId: "ctm_1" });
  paddle.getSubscription.mockResolvedValue({});
  paddle.cancelSubscription.mockResolvedValue({});
  paddle.readSubscription.mockReturnValue({
    subscriptionId: "sub_1",
    customerId: "ctm_1",
    priceId: null,
    status: "active",
    currentPeriodEnd: "2026-10-13T00:00:00Z",
    endsAt: null,
    cancelAtPeriodEnd: false,
  });
});

describe("billing routes write subscriptions with the service role", () => {
  it("checkout confirmation activates through the service role", async () => {
    const res = await confirm(post("/api/billing/confirm", { transactionId: "txn_1" }));

    expect(res.status).toBe(200);
    expect(subscriptionWrites("tenant")).toHaveLength(0);
    expect(subscriptionWrites("admin")).toEqual([
      expect.objectContaining({ op: "update", filters: [["agency_id", "a1"]], payload: expect.objectContaining({ status: "active" }) }),
    ]);
  });

  it("checkout confirmation inserts the row when the agency has none", async () => {
    adminExisting = null;

    await confirm(post("/api/billing/confirm", { transactionId: "txn_1" }));

    expect(subscriptionWrites("admin")).toEqual([
      expect.objectContaining({ op: "insert", payload: expect.objectContaining({ agency_id: "a1", status: "active" }) }),
    ]);
  });

  it("checkout confirmation still refuses another agency's transaction", async () => {
    paddle.getTransactionFacts.mockResolvedValue({ agencyId: "a2", subscriptionId: "sub_9", customerId: "ctm_9" });

    const res = await confirm(post("/api/billing/confirm", { transactionId: "txn_9" }));

    expect(res.status).toBe(403);
    expect(ops.filter((o) => o.table === "subscriptions")).toHaveLength(0);
  });

  it("cancellation mirrors Paddle through the service role", async () => {
    paddle.readSubscription.mockReturnValue({
      subscriptionId: "sub_1", customerId: "ctm_1", priceId: null, status: "active",
      currentPeriodEnd: "2026-10-13T00:00:00Z", endsAt: "2026-10-13T00:00:00Z", cancelAtPeriodEnd: true,
    });

    const res = await manage(post("/api/billing/subscription", { action: "cancel" }));

    expect(res.status).toBe(200);
    expect(subscriptionWrites("tenant")).toHaveLength(0);
    expect(subscriptionWrites("admin")).toEqual([
      expect.objectContaining({ op: "update", filters: [["agency_id", "a1"]], payload: expect.objectContaining({ cancel_at_period_end: true }) }),
    ]);
  });

  it("reconciles a subscription Paddle no longer has through the service role", async () => {
    paddle.cancelSubscription.mockRejectedValue(notFound());

    const res = await manage(post("/api/billing/subscription", { action: "cancel" }));

    expect(res.status).toBe(200);
    expect(subscriptionWrites("tenant")).toHaveLength(0);
    expect(subscriptionWrites("admin")).toEqual([
      expect.objectContaining({ op: "update", filters: [["agency_id", "a1"]], payload: expect.objectContaining({ status: "inactive" }) }),
    ]);
  });

  it("the portal reconciles a missing customer through the service role", async () => {
    paddle.createPortalUrl.mockRejectedValue(notFound());

    const res = await portal(new Request("https://example.com/api/billing/portal"));

    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(subscriptionWrites("tenant")).toHaveLength(0);
    expect(subscriptionWrites("admin")).toEqual([
      expect.objectContaining({ op: "update", filters: [["agency_id", "a1"]], payload: expect.objectContaining({ status: "inactive" }) }),
    ]);
  });
});
