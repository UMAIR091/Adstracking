// Throughput and failure-isolation for the scheduled-delivery engine.
//
// The engine claimed a batch of 50 occurrences into a 60s function that could
// finish a handful of them, advanced every claimed schedule up front, and
// appended stuck retries AFTER fresh work — so a backlog could never drain, and
// whatever a run failed to reach moved no counter at all. These pin the four
// properties that fixed it: claim only the remaining capacity, drain retries
// first, stop cleanly when the budget is spent and say how much was left, and
// never let one job's failure abandon the rest of the batch.
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";

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
vi.mock("@/lib/archivedClients", () => ({ pausedClientIds: async () => new Set<string>() }));

let runScheduledReports: typeof import("./scheduledReports").runScheduledReports;
beforeAll(async () => {
  ({ runScheduledReports } = await import("./scheduledReports"));
});

type Job = Record<string, unknown>;
let dueJobs: Job[] = [];
let stuckJobs: Job[] = [];
/** Every p_limit the engine asked for, per RPC. */
let claimLimits: Record<string, number> = {};
/** delivery_ids in the order they were actually processed. */
let processed: string[] = [];

const admin = {
  // Honours p_limit, which the engine now depends on to size its batch.
  rpc: async (fn: string, args: Record<string, number>) => {
    claimLimits[fn] = args.p_limit;
    const pool = fn === "claim_due_schedules" ? dueJobs : fn === "claim_stuck_deliveries" ? stuckJobs : [];
    return { data: pool.slice(0, args.p_limit), error: null };
  },
  from: () => {
    const chain: Record<string, unknown> = {};
    Object.assign(chain, {
      update: () => chain,
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      maybeSingle: async () => ({ data: { name: "Acme", email: "client@example.com" } }),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(res, rej),
    });
    return chain;
  },
};

const job = (id: string): Job => ({
  delivery_id: id,
  schedule_id: `sch-${id}`,
  agency_id: "pro",
  client_id: `cli-${id}`,
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (limit: number) => runScheduledReports(admin as any, limit);

let nowMs = 1_000_000;
/** Milliseconds each delivery consumes off the run budget. */
let jobCostMs = 0;

beforeEach(() => {
  vi.clearAllMocks();
  dueJobs = [];
  stuckJobs = [];
  claimLimits = {};
  processed = [];
  nowMs = 1_000_000;
  jobCostMs = 0;
  delete process.env.SCHEDULE_RUN_BUDGET_MS;
  vi.spyOn(Date, "now").mockImplementation(() => nowMs);
  getSubscriptionState.mockResolvedValue({ plan: "pro", hasAccess: true });
  createClientReport.mockResolvedValue({ ok: true, id: "rep-1", title: "Report", shareToken: "tok", data: {}, period: {} });
  deliverReport.mockImplementation(async (_c: unknown, input: { report: { id: string } }) => {
    nowMs += jobCostMs;
    return { ok: true, sent: 1 };
  });
  createClientReport.mockImplementation(async (_c: unknown, _a: string, clientId: string) => {
    processed.push(clientId.replace(/^cli-/, ""));
    return { ok: true, id: "rep-1", title: "Report", shareToken: "tok", data: {}, period: {} };
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a run claims only what it can finish", () => {
  it("never claims more than the batch size across both RPCs", async () => {
    stuckJobs = [job("s1"), job("s2")];
    dueJobs = [job("f1"), job("f2"), job("f3"), job("f4"), job("f5")];

    const result = await run(4);

    // 2 retries claimed, so only the remaining 2 slots are offered to new work.
    expect(claimLimits.claim_due_schedules).toBe(2);
    expect(result.processed).toBe(4);
  });

  it("caps retries at half the batch so a backlog can't starve due schedules", async () => {
    stuckJobs = Array.from({ length: 20 }, (_, i) => job(`s${i}`));
    dueJobs = [job("f1"), job("f2")];

    await run(6);

    // Retries take at most 3 of 6, leaving room for schedules due right now.
    expect(claimLimits.claim_stuck_deliveries).toBe(3);
    expect(claimLimits.claim_due_schedules).toBe(3);
  });

  it("offers the whole batch to new work when there is no backlog", async () => {
    dueJobs = [job("f1")];

    await run(5);

    expect(claimLimits.claim_due_schedules).toBe(5);
  });
});

describe("retries drain before new work", () => {
  it("processes stuck occurrences first", async () => {
    stuckJobs = [job("old1"), job("old2")];
    dueJobs = [job("new1")];

    await run(10);

    // Appended after fresh jobs previously, so in a run that finished only a few
    // jobs the backlog was never reached at all.
    expect(processed).toEqual(["old1", "old2", "new1"]);
  });
});

describe("the wall-clock budget", () => {
  it("stops starting work when the budget is spent and reports the remainder", async () => {
    dueJobs = [job("f1"), job("f2"), job("f3"), job("f4"), job("f5")];
    jobCostMs = 30_000; // default budget is 50s

    const result = await run(5);

    expect(result.processed).toBe(2);
    expect(result.sent).toBe(2);
    expect(result.deferred).toBe(3);
  });

  it("always attempts at least one job, even with no budget left", async () => {
    process.env.SCHEDULE_RUN_BUDGET_MS = "1";
    dueJobs = [job("f1"), job("f2"), job("f3")];
    jobCostMs = 5_000;

    const result = await run(3);

    expect(result.processed).toBe(1);
    expect(result.deferred).toBe(2);
  });

  it("reports no backlog when the whole batch fits", async () => {
    dueJobs = [job("f1"), job("f2")];

    const result = await run(5);

    expect(result).toEqual({ processed: 2, sent: 2, failed: 0, skipped: 0, deferred: 0 });
  });
});

describe("one job's failure never abandons the batch", () => {
  it("keeps going when delivery throws rather than returning a result", async () => {
    dueJobs = [job("f1"), job("f2"), job("f3")];
    deliverReport.mockImplementationOnce(async () => {
      throw new Error("resend exploded");
    });

    const result = await run(5);

    // processJob's contract is "never throws"; only createClientReport was
    // wrapped, so a throw here used to escape the loop and strand f2 and f3 with
    // their schedules already advanced.
    expect(result).toEqual({ processed: 3, sent: 2, failed: 1, skipped: 0, deferred: 0 });
  });

  it("keeps going when the ledger write fails", async () => {
    dueJobs = [job("f1"), job("f2")];
    const broken = {
      ...admin,
      from: (table: string) => {
        if (table === "report_deliveries") {
          const chain: Record<string, unknown> = {};
          Object.assign(chain, {
            update: () => chain,
            eq: () => {
              throw new Error("ledger unavailable");
            },
          });
          return chain;
        }
        return admin.from();
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await runScheduledReports(broken as any, 5);

    expect(result.processed).toBe(2);
    expect(result.sent).toBe(2);
  });
});
