// A run that dies after the email went out but before the ledger row was
// finalised leaves the occurrence "stuck"; the next run re-claims it. That
// retry must send the SAME email under the SAME idempotency key, so the email
// provider returns the first send instead of emailing the client twice.
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

const createClientReport = vi.fn();
const deliverReport = vi.fn();

vi.mock("@/lib/billing/subscription", () => ({ getSubscriptionState: async () => ({ plan: "pro", hasAccess: true }) }));
vi.mock("@/lib/reportGen", () => ({ createClientReport: (...a: unknown[]) => createClientReport(...a) }));
vi.mock("@/lib/delivery", () => ({ deliverReport: (...a: unknown[]) => deliverReport(...a) }));
vi.mock("@/lib/email", () => ({ emailConfigured: () => true }));
vi.mock("@/lib/errorLog", () => ({ logError: async () => {} }));

let runScheduledReports: typeof import("./scheduledReports").runScheduledReports;
beforeAll(async () => {
  ({ runScheduledReports } = await import("./scheduledReports"));
});

type Row = Record<string, unknown>;
let dueJobs: Row[] = [];
let stuckJobs: Row[] = [];
let ledgerReportId: string | null = null;
const ledgerPatches: Row[] = [];
const storedReport: Row = {
  id: "rep-first", title: "Acme — September", share_token: "tok-first",
  data: { k: 1 }, period_start: "2026-09-01", period_end: "2026-09-30",
};

const admin = {
  rpc: async (fn: string) => ({ data: fn === "claim_due_schedules" ? dueJobs : fn === "claim_stuck_deliveries" ? stuckJobs : null, error: null }),
  from: (table: string) => {
    let patch: Row | null = null;
    let ids: string[] | null = null;
    const chain = {
      update: (p: Row) => { patch = p; return chain; },
      select: () => chain,
      eq: () => {
        if (table === "report_deliveries" && patch) ledgerPatches.push(patch);
        return chain;
      },
      in: (_c: string, v: string[]) => { ids = v; return chain; },
      maybeSingle: async () => {
        if (table === "report_deliveries") return { data: { report_id: ledgerReportId } };
        if (table === "reports") return { data: storedReport };
        if (table === "clients") return { data: { name: "Acme", email: "client@example.com" } };
        return { data: { name: "Agency" } };
      },
      then: (res: (v: unknown) => unknown) =>
        Promise.resolve(table === "clients" && ids ? { data: ids.map((id) => ({ id, archived: false })), error: null } : { error: null }).then(res),
    };
    return chain;
  },
};

const job = (): Row => ({
  delivery_id: "del-1", schedule_id: "sch-1", agency_id: "ag-1", client_id: "cli-1",
  template_key: null, frequency: "monthly", send_day: 1, send_hour: 8,
  recipients: ["client@example.com"], subject: null, message: null,
  occurrence_at: "2026-10-01T08:00:00Z", period: null, attempts: 1,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = () => runScheduledReports(admin as any, 50);

beforeEach(() => {
  vi.clearAllMocks();
  dueJobs = [];
  stuckJobs = [];
  ledgerReportId = null;
  ledgerPatches.length = 0;
  createClientReport.mockResolvedValue({ ok: true, id: "rep-new", title: "New", shareToken: "tok-new", data: {}, period: { start: "a", end: "b" } });
  deliverReport.mockResolvedValue({ ok: true, sent: 1 });
});

describe("a retried scheduled delivery", () => {
  it("reuses the report its first attempt generated, under the same idempotency key", async () => {
    ledgerReportId = "rep-first";
    stuckJobs = [job()];
    await run();
    expect(createClientReport).not.toHaveBeenCalled();
    const input = deliverReport.mock.calls[0][1];
    expect(input.report.id).toBe("rep-first");
    expect(input.report.shareToken).toBe("tok-first");
    expect(input.idempotencyKey).toBe("scheduled-delivery-del-1");
  });

  it("on a first attempt generates the report and records it before sending", async () => {
    dueJobs = [job()];
    await run();
    expect(createClientReport).toHaveBeenCalledTimes(1);
    const recorded = ledgerPatches.findIndex((p) => p.report_id === "rep-new" && !("status" in p));
    expect(recorded).toBeGreaterThan(-1);
    expect(deliverReport.mock.calls[0][1].idempotencyKey).toBe("scheduled-delivery-del-1");
  });
});
