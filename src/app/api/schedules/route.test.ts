// Scheduled delivery is the free/paid line. Tenants can no longer insert or
// edit schedule rows themselves (migration 0038), so this route is the only way
// to create one, and it writes with the service role. That makes its own checks
// load-bearing: the plan must include scheduled delivery, and the client must
// belong to the caller's current agency, not merely be visible to them.
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

const requireActiveAccess = vi.fn();
const getSubscriptionState = vi.fn();
const tenantFilters: [string, unknown][] = [];
const adminOps: { op: string; table: string; payload?: unknown; filters: [string, unknown][] }[] = [];
let visibleClient: { id: string } | null = { id: "c1" };

vi.mock("@/lib/agency", () => ({
  getCurrentUserAndAgency: async () => ({ user: { id: "u1" }, agency: { id: "a1" } }),
}));
vi.mock("@/lib/billing/subscription", () => ({
  requireActiveAccess: (...a: unknown[]) => requireActiveAccess(...a),
  getSubscriptionState: (...a: unknown[]) => getSubscriptionState(...a),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    from: () => {
      const refuse = () => {
        throw new Error("schedules must not be written with the tenant client");
      };
      const chain = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          tenantFilters.push([col, val]);
          return chain;
        },
        maybeSingle: async () => ({ data: visibleClient }),
        delete: refuse,
        insert: refuse,
      };
      return chain;
    },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const record = (op: string, payload?: unknown) => {
        const entry = { op, table, payload, filters: [] as [string, unknown][] };
        adminOps.push(entry);
        const chain = {
          eq: (col: string, val: unknown) => {
            entry.filters.push([col, val]);
            return chain;
          },
          then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
            Promise.resolve({ error: null }).then(res, rej),
        };
        return chain;
      };
      return { delete: () => record("delete"), insert: (row: unknown) => record("insert", row) };
    },
  }),
}));

let POST: (req: Request) => Promise<Response>;
beforeAll(async () => {
  ({ POST } = await import("./route"));
});

const save = () =>
  POST(
    new Request("https://example.com/api/schedules", {
      method: "POST",
      body: JSON.stringify({ clientId: "c1", frequency: "weekly", recipients: ["client@example.com"], sendDay: 1, sendHour: 9 }),
    })
  );

beforeEach(() => {
  vi.clearAllMocks();
  tenantFilters.length = 0;
  adminOps.length = 0;
  visibleClient = { id: "c1" };
  requireActiveAccess.mockResolvedValue(null);
  getSubscriptionState.mockResolvedValue({ plan: "pro", hasAccess: true });
});

describe("saving a schedule", () => {
  it("refuses the Free plan with 402 and writes nothing", async () => {
    getSubscriptionState.mockResolvedValue({ plan: "free", hasAccess: true });

    const res = await save();

    expect(res.status).toBe(402);
    expect(adminOps).toHaveLength(0);
  });

  it("refuses an agency with no access and writes nothing", async () => {
    requireActiveAccess.mockResolvedValue({ error: "Subscription required.", status: 402 });

    const res = await save();

    expect(res.status).toBe(402);
    expect(adminOps).toHaveLength(0);
  });

  it("writes a paid plan's schedule with the service role, scoped to the agency", async () => {
    const res = await save();

    expect(res.status).toBe(200);
    expect(tenantFilters).toEqual(expect.arrayContaining([["id", "c1"], ["agency_id", "a1"]]));
    expect(adminOps.map((o) => o.op)).toEqual(["delete", "insert"]);
    expect(adminOps[0]).toMatchObject({ table: "report_schedules", filters: [["client_id", "c1"], ["agency_id", "a1"]] });
    expect(adminOps[1]).toMatchObject({
      table: "report_schedules",
      payload: expect.objectContaining({ agency_id: "a1", client_id: "c1", frequency: "weekly", send_hour: 9 }),
    });
  });

  it("returns 404 for a client outside the current agency and writes nothing", async () => {
    visibleClient = null;

    const res = await save();

    expect(res.status).toBe(404);
    expect(adminOps).toHaveLength(0);
  });
});
