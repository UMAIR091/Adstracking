// Scheduled delivery is the line between Free and paid, and the cron is the
// only thing that actually delivers. It used to ask just "does this agency have
// access?", which a Free agency does, so any schedule row that existed for one
// (left over from a downgrade, or written straight to the table) was generated
// and emailed like a paid schedule. These tests pin the plan check at delivery.
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

const getSubscriptionState = vi.fn();
const createClientReport = vi.fn();
const deliverReport = vi.fn();

vi.mock("@/lib/billing/subscription", () => ({
  getSubscriptionState: (...a: unknown[]) => getSubscriptionState(...a),
}));
vi.mock("@/lib/reportGen", () => ({ createClientReport: (...a: unknown[]) => createClientReport(...a) }));
vi.mock("@/lib/delivery", () => ({ deliverReport: (...a: unknown[]) => deliverReport(...a) }));
vi.mock("@/lib/email", () => ({ emailConfigured: () => true }));
vi.mock("@/lib/errorLog", () => ({ logError: async () => {} }));

let runScheduledReports: typeof import("./scheduledReports").runScheduledReports;
beforeAll(async () => {
  ({ runScheduledReports } = await import("./scheduledReports"));
});

type Job = Record<string, unknown>;
let dueJobs: Job[] = [];
let stuckJobs: Job[] = [];
const ledger = new Map<string, Record<string, unknown>>();

// Stand-in for the service-role client: the two claim RPCs, ledger/schedule
// updates (`update().eq()` awaited) and the branding reads (`maybeSingle`).
const admin = {
  rpc: async (fn: string) => ({
    data: fn === "claim_due_schedules" ? dueJobs : fn === "claim_stuck_deliveries" ? stuckJobs : null,
    error: null,
  }),
  from: (table: string) => {
    let patch: Record<string, unknown> | null = null;
    const chain = {
      update: (p: Record<string, unknown>) => {
        patch = p;
        return chain;
      },
      select: () => chain,
      eq: (col: string, val: string) => {
        if (table === "report_deliveries" && patch && col === "id") ledger.set(val, patch);
        return chain;
      },
      maybeSingle: async () => ({ data: table === "clients" ? { name: "Acme", email: "client@example.com" } : { name: "Agency" } }),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve({ error: null }).then(res, rej),
    };
    return chain;
  },
};

const job = (agency: string, n = 1): Job => ({
  delivery_id: `del-${agency}-${n}`,
  schedule_id: `sch-${agency}-${n}`,
  agency_id: agency,
  client_id: `cli-${agency}`,
  template_key: "seo",
  frequency: "weekly",
  send_day: 1,
  send_hour: 8,
  recipients: ["client@example.com"],
  subject: null,
  message: null,
  occurrence_at: "2026-09-14T08:00:00Z",
  period: null,
});

// Each agency id doubles as its plan; "…-lapsed" has no access at all.
const stateFor = (agency: string) => ({
  plan: agency.replace(/-lapsed$/, ""),
  hasAccess: !agency.endsWith("-lapsed"),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = () => runScheduledReports(admin as any, 50);

beforeEach(() => {
  vi.clearAllMocks();
  dueJobs = [];
  stuckJobs = [];
  ledger.clear();
  getSubscriptionState.mockImplementation(async (_c: unknown, agency: string) => stateFor(agency));
  createClientReport.mockResolvedValue({ ok: true, id: "rep-1", title: "Report", shareToken: "tok", data: {}, period: {} });
  deliverReport.mockResolvedValue({ ok: true, sent: 1 });
});

describe("scheduled delivery checks the plan at send time", () => {
  it("skips a Free agency's schedule without generating or sending anything", async () => {
    dueJobs = [job("free")];

    const result = await run();

    expect(result).toEqual({ processed: 1, sent: 0, failed: 0, skipped: 1 });
    expect(createClientReport).not.toHaveBeenCalled();
    expect(deliverReport).not.toHaveBeenCalled();
    expect(ledger.get("del-free-1")).toEqual({ status: "skipped", error: "plan excludes scheduled delivery" });
  });

  it("still delivers for paid plans and the trial", async () => {
    dueJobs = [job("pro"), job("agency"), job("trial")];

    const result = await run();

    expect(result).toEqual({ processed: 3, sent: 3, failed: 0, skipped: 0 });
    expect(createClientReport).toHaveBeenCalledTimes(3);
    expect(ledger.get("del-pro-1")).toMatchObject({ status: "sent" });
  });

  it("keeps skipping agencies with no access, with that reason", async () => {
    dueJobs = [job("pro-lapsed")];

    const result = await run();

    expect(result.skipped).toBe(1);
    expect(createClientReport).not.toHaveBeenCalled();
    expect(ledger.get("del-pro-lapsed-1")).toEqual({ status: "skipped", error: "subscription inactive" });
  });

  it("applies the same check to retried deliveries", async () => {
    stuckJobs = [job("free", 2)];

    const result = await run();

    expect(result).toEqual({ processed: 1, sent: 0, failed: 0, skipped: 1 });
    expect(deliverReport).not.toHaveBeenCalled();
  });

  it("resolves each agency's plan once per run", async () => {
    dueJobs = [job("free", 1), job("free", 2)];
    stuckJobs = [job("free", 3)];

    await run();

    expect(getSubscriptionState).toHaveBeenCalledTimes(1);
    expect(Array.from(ledger.values()).every((p) => p.status === "skipped")).toBe(true);
  });
});
