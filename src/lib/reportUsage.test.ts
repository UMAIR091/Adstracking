// Report allowances used to be counted from saved reports. A saved report can
// be deleted, so on the Free plan (one report a month) a user could generate,
// delete and generate again without end. Allowances are now counted from
// generations (usage_counters.reports_generated), which deleting a report never
// touches, and the cap is taken atomically at the moment a report is produced.
//
// These tests run the real createClientReport, checkReportLimit and usage
// helpers against an in-memory database. Its reserve/release functions mirror
// migration 0040, including the per-agency lock, so concurrent requests
// interleave the way they would against Postgres. The SQL itself, and that
// tenants can't write usage_counters, are checked against a real database by
// scripts/verify-report-usage-limit.mjs.
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";

type Row = Record<string, unknown>;
type Counter = { agency_id: string; metric: string; period_month: string; count: number };

const AGENCY = "a1";
const CLIENT = "c1";

let plan = "free";
const reports: Row[] = [];
const counters: Counter[] = [];
let dataLoads = 0;
let onDataLoad: (() => void) | null = null;
let noData = false;
let insertError: { message: string } | null = null;
let reserveError: { message: string } | null = null;
let releases = 0;
let seq = 0;

const monthOf = (d = new Date()) => d.toISOString().slice(0, 8) + "01";

// Generations counted for the agency, in one month or overall.
const generated = (month?: string) =>
  counters
    .filter((c) => c.agency_id === AGENCY && c.metric === "reports_generated" && (!month || c.period_month === month))
    .reduce((n, c) => n + c.count, 0);

function bump(agency: string, month: string) {
  const row = counters.find((c) => c.agency_id === agency && c.metric === "reports_generated" && c.period_month === month);
  if (row) row.count += 1;
  else counters.push({ agency_id: agency, metric: "reports_generated", period_month: month, count: 1 });
}

// 90 days of Search Console history ending two days ago.
function gscSnapshot() {
  const end = Date.now() - 2 * 86400000;
  const byDate = Array.from({ length: 90 }, (_, i) => ({
    date: new Date(end - (89 - i) * 86400000).toISOString().slice(0, 10),
    clicks: 1,
    impressions: 10,
    ctr: 0.1,
    position: 5,
  }));
  return {
    totals: { clicks: 90, impressions: 900, ctr: 0.1, position: 5 },
    byDate,
    topQueries: [{ key: "q" }],
    topPages: [],
    topCountries: [],
    topDevices: [],
    previousTotals: null,
    movers: null,
  };
}

// A small query builder over the in-memory tables, covering the calls report
// generation, the limit check and report deletion make.
function table(name: string) {
  const filters: [string, unknown][] = [];
  let op: "select" | "insert" | "delete" = "select";
  let row: Row = {};
  const matching = <T extends Row>(rows: T[]) => rows.filter((r) => filters.every(([col, val]) => r[col] === val));
  const chain = {
    select: () => chain,
    eq: (col: string, val: unknown) => {
      filters.push([col, val]);
      return chain;
    },
    is: () => chain,
    insert: (values: Row) => {
      op = "insert";
      row = values;
      return chain;
    },
    delete: () => {
      op = "delete";
      return chain;
    },
    maybeSingle: async () => {
      if (name === "clients") return { data: { id: CLIENT, name: "Acme", archived: false }, error: null };
      if (name === "gsc_snapshots") return { data: noData ? null : { data: gscSnapshot() }, error: null };
      if (name === "report_templates") return { data: { name: "SEO Report", sections: [] }, error: null };
      return { data: null, error: null };
    },
    // reports: insert(...).select(...).single()
    single: async () => {
      if (insertError) return { data: null, error: insertError };
      const stored: Row = { ...row, id: `report-${++seq}` };
      reports.push(stored);
      return { data: { id: stored.id, share_token: stored.share_token }, error: null };
    },
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
      let out: unknown = { data: [], error: null };
      if (name === "data_sources") {
        dataLoads++;
        onDataLoad?.();
        out = { data: [{ id: "ds1", type: "gsc", config: { site_url: "sc-domain:acme.com" } }], error: null };
      } else if (name === "usage_counters") {
        out = { data: matching(counters as unknown as Row[]).map((c) => ({ count: c.count })), error: null };
      } else if (name === "reports" && op === "delete") {
        for (const r of matching(reports)) reports.splice(reports.indexOf(r), 1);
        out = { error: null };
      }
      return Promise.resolve(out).then(res, rej);
    },
  };
  return chain;
}

// Mirrors pg_advisory_xact_lock in reserve_report_generation: one reservation
// runs at a time, and the pause sits exactly where an unlocked version would
// let a second request read the same count.
let lockTail: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = lockTail.then(fn);
  lockTail = run.catch(() => undefined);
  return run;
}
const pause = () => new Promise((resolve) => setTimeout(resolve, 5));

const admin = {
  from: table,
  rpc: async (fn: string, args: Row) => {
    if (fn === "reserve_report_generation") {
      if (reserveError) return { data: null, error: reserveError };
      return locked(async () => {
        const month = monthOf();
        const used = counters
          .filter((c) => c.agency_id === args.p_agency && c.metric === "reports_generated" && (args.p_lifetime || c.period_month === month))
          .reduce((n, c) => n + c.count, 0);
        await pause();
        if (args.p_limit !== null && used >= (args.p_limit as number)) return { data: null, error: null };
        bump(args.p_agency as string, month);
        return { data: month, error: null };
      });
    }
    if (fn === "release_report_generation") {
      releases++;
      const counter = counters.find(
        (c) => c.agency_id === args.p_agency && c.metric === "reports_generated" && c.period_month === args.p_period_month
      );
      if (counter) counter.count = Math.max(counter.count - 1, 0);
      return { data: null, error: null };
    }
    return { data: null, error: null };
  },
};

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin }));
vi.mock("@/lib/billing/subscription", () => ({
  getSubscriptionState: async () => ({
    plan,
    planName: plan === "free" ? "Free" : plan === "trial" ? "Free trial" : "Pro",
    hasAccess: true,
  }),
}));
vi.mock("@/lib/ai", () => ({ generateReportInsightsCached: async () => ({ insights: null, cached: true }) }));

let createClientReport: typeof import("./reportGen").createClientReport;
let checkReportLimit: typeof import("./billing/limits").checkReportLimit;
beforeAll(async () => {
  ({ createClientReport } = await import("./reportGen"));
  ({ checkReportLimit } = await import("./billing/limits"));
});

const tenant = { from: table };
const generate = () => createClientReport(tenant as never, AGENCY, CLIENT, { period: "last_28" });

// Exactly what the reports list does when a user deletes a report.
const deleteReport = async (id: string) => {
  await tenant.from("reports").delete().eq("id", id);
};
const deleteAllReports = async () => {
  for (const r of [...reports]) await deleteReport(r.id as string);
};

beforeEach(() => {
  plan = "free";
  reports.length = 0;
  counters.length = 0;
  dataLoads = 0;
  onDataLoad = null;
  noData = false;
  insertError = null;
  reserveError = null;
  releases = 0;
  seq = 0;
  lockTail = Promise.resolve();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("report generations are counted, not saved reports", () => {
  it("generate, delete, generate again counts both generations", async () => {
    plan = "pro";

    expect((await generate()).ok).toBe(true);
    await deleteAllReports();
    expect((await generate()).ok).toBe(true);

    expect(reports).toHaveLength(1);
    expect(generated()).toBe(2);
  });

  it("deleting reports never lowers or resets the count", async () => {
    plan = "pro";
    for (let i = 0; i < 3; i++) expect((await generate()).ok).toBe(true);

    await deleteAllReports();

    expect(reports).toHaveLength(0);
    expect(generated()).toBe(3);
    expect(releases).toBe(0);
  });
});

describe("the Free plan's monthly report can't be regained by deleting it", () => {
  it("refuses a second generation after the first report is deleted", async () => {
    expect((await generate()).ok).toBe(true);
    await deleteAllReports();

    expect(await generate()).toMatchObject({ ok: false, status: 402, error: expect.stringContaining("1 report a month") });
    expect(reports).toHaveLength(0);
    expect(generated()).toBe(1);
  });

  it("repeated delete-and-retry cycles never produce another report", async () => {
    expect((await generate()).ok).toBe(true);

    for (let round = 0; round < 5; round++) {
      await deleteAllReports();
      expect(await generate()).toMatchObject({ ok: false, status: 402 });
    }

    expect(reports).toHaveLength(0);
    expect(generated()).toBe(1);
    expect(await checkReportLimit(tenant as never, AGENCY)).toMatchObject({ allowed: false, current: 1, limit: 1 });
  });

  it("renews with the calendar month, still counted from generations", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-20T12:00:00Z"));
    expect((await generate()).ok).toBe(true);
    await deleteAllReports();
    expect((await generate()).ok).toBe(false);

    vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
    expect((await generate()).ok).toBe(true);
    expect(generated("2026-09-01")).toBe(1);
    expect(generated("2026-10-01")).toBe(1);
  });
});

describe("the trial's report cap uses the same counter", () => {
  it("deleting the trial's report doesn't return the allowance", async () => {
    plan = "trial";
    expect((await generate()).ok).toBe(true);
    await deleteAllReports();

    expect(await generate()).toMatchObject({ ok: false, status: 402, error: expect.stringContaining("free trial") });
    expect(await checkReportLimit(tenant as never, AGENCY)).toMatchObject({ allowed: false, current: 1, limit: 1 });
  });

  it("counts generations from every month, since the trial's cap covers the whole trial", async () => {
    plan = "trial";
    counters.push({ agency_id: AGENCY, metric: "reports_generated", period_month: "2026-01-01", count: 1 });

    expect(await generate()).toMatchObject({ ok: false, status: 402 });
    expect(reports).toHaveLength(0);
  });
});

describe("the limit is enforced where the report is produced", () => {
  it("refuses when the last slot is taken after the early check", async () => {
    // Another generation for the same agency lands while this request loads data.
    onDataLoad = () => bump(AGENCY, monthOf());

    const result = await generate();

    expect(dataLoads).toBe(1); // it got past the early check
    expect(result).toMatchObject({ ok: false, status: 402 });
    expect(reports).toHaveLength(0);
    expect(generated()).toBe(1); // only the other request's generation
  });

  it("two simultaneous requests can't both take the last available slot", async () => {
    const [a, b] = await Promise.all([generate(), generate()]);

    expect(dataLoads).toBe(2); // both got past the early check
    expect([a, b].filter((r) => r.ok)).toHaveLength(1);
    expect([a, b].find((r) => !r.ok)).toMatchObject({ ok: false, status: 402 });
    expect(reports).toHaveLength(1);
    expect(generated()).toBe(1);
  });

  it("refuses rather than guess when the allowance can't be checked", async () => {
    reserveError = { message: "connection reset" };

    expect(await generate()).toMatchObject({ ok: false, status: 503 });
    expect(reports).toHaveLength(0);
  });

  it("never blocks an unlimited plan when metering is down", async () => {
    plan = "pro";
    reserveError = { message: "connection reset" };

    expect((await generate()).ok).toBe(true);
    expect(reports).toHaveLength(1);
  });
});

describe("legitimate generation and deletion still work", () => {
  it("a Free account under its allowance generates a report and can delete it", async () => {
    expect(await generate()).toMatchObject({ ok: true });
    expect(reports).toHaveLength(1);

    await deleteReport(reports[0].id as string);

    expect(reports).toHaveLength(0);
  });

  it("paid plans generate without a cap, each generation counted once", async () => {
    plan = "pro";
    for (let i = 0; i < 5; i++) expect((await generate()).ok).toBe(true);

    expect(reports).toHaveLength(5);
    expect(generated()).toBe(5);
  });

  it("a report that fails to save gives its allowance back", async () => {
    insertError = { message: "insert failed" };
    expect(await generate()).toMatchObject({ ok: false, status: 400 });
    expect(generated()).toBe(0);
    expect(releases).toBe(1);

    insertError = null;
    expect((await generate()).ok).toBe(true);
    expect(generated()).toBe(1);
  });

  it("a request refused before a report is produced uses no allowance", async () => {
    noData = true;

    expect(await generate()).toMatchObject({ ok: false, status: 400 });
    expect(generated()).toBe(0);
  });
});
