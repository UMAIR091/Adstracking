import { describe, expect, it, vi } from "vitest";
import { createClientReport } from "./reportGen";

// End-to-end through createClientReport with a stubbed database, because the
// phase's completion criterion is a property of the whole path, not of any one
// helper: a selected period must never silently produce data for a different
// period.
//
// Nothing here touches Supabase, Google or the AI — the stub returns fixed rows
// and captures the row that would be inserted.

vi.mock("@/lib/ai", () => ({
  generateReportInsightsCached: async () => ({ insights: null, cached: true }),
}));
vi.mock("@/lib/usage", () => ({ trackUsage: async () => {} }));
vi.mock("@/lib/billing/limits", () => ({ checkReportLimit: async () => ({ allowed: true }) }));

const NOW = Date.parse("2026-09-16T12:00:00Z");

/** 90 days of Search Console history ending at the settled day (14 Sep 2026). */
function gscDays(count = 90) {
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const date = new Date(Date.parse("2026-09-14T00:00:00Z") - i * 86400000).toISOString().slice(0, 10);
    // 1 click and 10 impressions every day, so any window's totals are simply
    // its length — which makes an off-by-one or a wrong window obvious.
    out.push({ date, clicks: 1, impressions: 10, ctr: 0.1, position: 5 });
  }
  return out;
}

type Insert = Record<string, unknown>;

/** Archive rows (metric_daily) spanning a date range, 1 click / 10 impressions. */
function archiveRows(from: string, to: string) {
  const out: { date: string; provider: string; client_id: string; data_source_id: string; metrics: Record<string, number> }[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86400000) {
    out.push({
      date: new Date(t).toISOString().slice(0, 10),
      provider: "gsc", client_id: "c1", data_source_id: "ds1",
      metrics: { clicks: 1, impressions: 10, ctr: 0.1, position: 5 },
    });
  }
  return out;
}

function stubSupabase(opts: { gscByDate?: ReturnType<typeof gscDays>; archive?: ReturnType<typeof archiveRows> } = {}) {
  const inserted: Insert[] = [];
  const byDate = opts.gscByDate ?? gscDays();
  const archive = opts.archive ?? [];

  const table = (name: string) => {
    const api: Record<string, unknown> = {};
    const self = () => api;
    Object.assign(api, {
      select: self, eq: self, in: self, is: self, order: self,
      maybeSingle: async () => {
        if (name === "clients") return { data: { id: "c1", name: "Acme" } };
        if (name === "gsc_snapshots") {
          return { data: { data: { totals: { clicks: 0, impressions: 0, ctr: 0, position: 0 }, byDate, topQueries: [{ key: "q" }], topPages: [], topCountries: [], topDevices: [], previousTotals: null, movers: null } } };
        }
        if (name === "ga4_snapshots") return { data: null };
        if (name === "report_templates") return { data: { name: "SEO Report", sections: [] } };
        return { data: null };
      },
      single: async () => ({ data: { id: "r1", share_token: "tok" }, error: null }),
      insert: (row: Insert) => { inserted.push(row); return api; },
      update: self,
    });
    // data_sources returns the connected list directly from the builder.
    if (name === "data_sources") {
      Object.assign(api, {
        select: () => ({ eq: async () => ({ data: [{ id: "ds1", type: "gsc", config: { site_url: "sc-domain:x" } }] }) }),
      });
    }
    // metric_daily: fetchHistory chains select/eq/gte/lte/order/range and then
    // AWAITS the builder itself, so the stub has to be thenable.
    if (name === "metric_daily") {
      let from = "", to = "", offset = 0;
      const q: Record<string, unknown> = {};
      Object.assign(q, {
        select: () => q,
        eq: () => q,
        gte: (_c: string, v: string) => { from = v; return q; },
        lte: (_c: string, v: string) => { to = v; return q; },
        order: () => q,
        range: (start: number) => { offset = start; return q; },
        then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
          // One page is enough for these fixtures; later pages come back empty
          // so fetchHistory's loop terminates.
          resolve({ data: offset === 0 ? archive.filter((r) => r.date >= from && r.date <= to) : [], error: null }),
      });
      return q;
    }
    return api;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: { from: (n: string) => table(n) } as any, inserted };
}

const generate = async (opts: Record<string, unknown>, stub = stubSupabase()) => {
  const res = await createClientReport(stub.client, "a1", "c1", { now: NOW, ...opts });
  return { res, inserted: stub.inserted[0] };
};

describe("the stored period always matches the selected period", () => {
  it.each([
    ["last_7", "2026-09-08", "2026-09-14", 7],
    ["last_14", "2026-09-01", "2026-09-14", 14],
    ["last_30", "2026-08-16", "2026-09-14", 30],
    ["previous_month", "2026-08-01", "2026-08-31", 31],
    ["this_month", "2026-09-01", "2026-09-14", 14],
  ])("%s stores %s to %s", async (preset, start, end, days) => {
    const { res, inserted } = await generate({ period: preset });
    expect(res.ok).toBe(true);
    expect(inserted.period_start).toBe(start);
    expect(inserted.period_end).toBe(end);
    // Totals are 1 click/day, so the numbers prove the slice really is that
    // window rather than the snapshot's own 90 days.
    const data = inserted.data as { gsc: { totals: { clicks: number } } };
    expect(data.gsc.totals.clicks).toBe(days);
  });

  it("a custom range stores exactly the dates asked for", async () => {
    const { res, inserted } = await generate({ period: "custom", customStart: "2026-08-03", customEnd: "2026-08-09" });
    expect(res.ok).toBe(true);
    expect(inserted.period_start).toBe("2026-08-03");
    expect(inserted.period_end).toBe("2026-08-09");
    expect((inserted.data as { gsc: { totals: { clicks: number } } }).gsc.totals.clicks).toBe(7);
  });

  it("previous_month is NOT the last 28 or 30 days", async () => {
    const month = await generate({ period: "previous_month" });
    const d28 = await generate({ period: "last_28" });
    const d30 = await generate({ period: "last_30" });
    expect(month.inserted.period_start).not.toBe(d28.inserted.period_start);
    expect(month.inserted.period_start).not.toBe(d30.inserted.period_start);
    expect(month.inserted.period_start).toBe("2026-08-01");
  });
});

// A previous QUARTER is nearly always outside the rolling 90-day snapshot
// cache — Q2 ends up to two and a half months before the cache begins — so
// quarterly reporting depends on the durable metric_daily archive.
describe("windows older than the rolling cache come from the archive", () => {
  it("serves a previous quarter from archived daily rows", async () => {
    const stub = stubSupabase({ archive: archiveRows("2026-04-01", "2026-06-30") });
    const { res, inserted } = await generate({ period: "previous_quarter" }, stub);
    expect(res.ok).toBe(true);
    expect(inserted.period_start).toBe("2026-04-01");
    expect(inserted.period_end).toBe("2026-06-30");
    // 91 days at 1 click/day — proof the figures are the quarter's, not the
    // 90-day cache's.
    expect((inserted.data as { gsc: { totals: { clicks: number } } }).gsc.totals.clicks).toBe(91);
  });

  it("still refuses when the archive covers too little of the window", async () => {
    // June only — 30 of Q2's 91 days, a third.
    const stub = stubSupabase({ gscByDate: gscDays(30), archive: archiveRows("2026-06-01", "2026-06-30") });
    const { res } = await generate({ period: "previous_quarter" }, stub);
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toMatch(/stored history/i);
    expect(stub.inserted).toHaveLength(0);
  });
});

// A period whose data stops a few days short used to be refused outright, so a
// paused ad account or a provider that reports nothing for a day cost the whole
// report. The derive functions already clip to the window and the report
// already carries `requested` vs `coverage` — rendered as "Data is available
// for N of the M days in this period" — so a majority-covered window is
// generated and the shortfall disclosed instead.
describe("partial coverage of the requested period", () => {
  // Q2 2026 is 91 days, so the 50% bar is 46.
  const QUARTER_DAYS = 91;
  const BAR = Math.ceil(QUARTER_DAYS * 0.5);

  it("generates when most of the period has data, keeping the REQUESTED window", async () => {
    // May + June = 61 of 91 days (67%).
    const stub = stubSupabase({ gscByDate: gscDays(30), archive: archiveRows("2026-05-01", "2026-06-30") });
    const { res, inserted } = await generate({ period: "previous_quarter" }, stub);

    expect(res.ok).toBe(true);
    // The period is NOT narrowed to the data: the report still says Q2.
    expect(inserted.period_start).toBe("2026-04-01");
    expect(inserted.period_end).toBe("2026-06-30");

    const meta = (inserted.data as { meta: { requested: { start: string; end: string }; coverage: { start: string; end: string } } }).meta;
    expect(meta.requested).toEqual({ start: "2026-04-01", end: "2026-06-30" });
    // Coverage tells the truth about which days were measured — this is what
    // the web report and PDF render as "N of the M days".
    expect(meta.coverage).toEqual({ start: "2026-05-01", end: "2026-06-30" });

    // 1 click/day, so the total is the days actually measured — never padded
    // out to the full 91 with invented zeros.
    expect((inserted.data as { gsc: { totals: { clicks: number } } }).gsc.totals.clicks).toBe(61);
  });

  it("generates at exactly the threshold", async () => {
    // 16 May–30 Jun = 46 days = the bar exactly.
    const stub = stubSupabase({ gscByDate: gscDays(30), archive: archiveRows("2026-05-16", "2026-06-30") });
    const { res, inserted } = await generate({ period: "previous_quarter" }, stub);
    expect(BAR).toBe(46);
    expect(res.ok).toBe(true);
    expect((inserted.data as { gsc: { totals: { clicks: number } } }).gsc.totals.clicks).toBe(BAR);
  });

  it("refuses one day below the threshold", async () => {
    // 17 May–30 Jun = 45 days, one short.
    const stub = stubSupabase({ gscByDate: gscDays(30), archive: archiveRows("2026-05-17", "2026-06-30") });
    const { res } = await generate({ period: "previous_quarter" }, stub);
    expect(res.ok).toBe(false);
    expect(stub.inserted).toHaveLength(0);
  });

  it("refuses — and stores nothing — when no day of the window has data", async () => {
    // 30 days of September history, asked for Q2: zero overlap. This must not
    // slip through as an empty stored report.
    const stub = stubSupabase({ gscByDate: gscDays(30) });
    const { res } = await generate({ period: "previous_quarter" }, stub);
    expect(res.ok).toBe(false);
    expect(stub.inserted).toHaveLength(0);
  });

  it("a short tail no longer costs the whole report", async () => {
    // The production failure this fixes: a 14-day window whose sources stop two
    // days early. 12 of 14 days is comfortably over the bar.
    const stub = stubSupabase({ gscByDate: gscDays(90).filter((d) => d.date <= "2026-09-12") });
    const { res, inserted } = await generate({ period: "last_14" }, stub);

    expect(res.ok).toBe(true);
    expect(inserted.period_start).toBe("2026-09-01");
    expect(inserted.period_end).toBe("2026-09-14");
    const meta = (inserted.data as { meta: { coverage: { end: string } } }).meta;
    expect(meta.coverage.end).toBe("2026-09-12");
    expect((inserted.data as { gsc: { totals: { clicks: number } } }).gsc.totals.clicks).toBe(12);
  });
});

describe("refuses rather than serving the wrong window", () => {
  it("fails when the requested window predates all stored history", async () => {
    const stub = stubSupabase({ gscByDate: gscDays(30) });
    const { res } = await generate({ period: "previous_quarter" }, stub);
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toMatch(/stored history/i);
    expect(stub.inserted).toHaveLength(0);
  });

  it("rejects an unknown preset", async () => {
    const { res } = await generate({ period: "last_45" });
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toMatch(/unknown reporting period/i);
  });

  it("rejects a custom range ending beyond settled data", async () => {
    const { res } = await generate({ period: "custom", customStart: "2026-09-01", customEnd: "2026-09-16" });
    expect(res.ok).toBe(false);
  });
});

describe("derived windows declare what they cannot show", () => {
  it("records the unavailable sections in meta", async () => {
    const { inserted } = await generate({ period: "previous_month" });
    const meta = (inserted.data as { meta: { unavailable?: { section: string }[]; periodKind?: string; periodLabel?: string } }).meta;
    expect(meta.periodKind).toBe("calendar");
    expect(meta.periodLabel).toBe("August 2026");
    expect(meta.unavailable?.map((u) => u.section)).toContain("Top queries and pages");
  });

  it("drops the snapshot's own keyword tables rather than reusing them", async () => {
    const { inserted } = await generate({ period: "previous_month" });
    const data = inserted.data as { gsc: { topQueries: unknown[] } };
    expect(data.gsc.topQueries).toEqual([]);
  });

  it("keeps full fidelity for the cached 28-day window", async () => {
    const { inserted } = await generate({ period: "last_28" });
    const data = inserted.data as { gsc: { topQueries: unknown[] }; meta: { unavailable?: unknown[] } };
    // Served straight from the snapshot: tables intact, nothing unavailable.
    expect(data.gsc.topQueries.length).toBe(1);
    expect(data.meta.unavailable).toBeUndefined();
  });
});

describe("backward compatibility", () => {
  it("periodDays 28 and 90 still resolve to the same rolling windows", async () => {
    const a = await generate({ periodDays: 28 });
    expect(a.inserted.period_start).toBe("2026-08-18");
    expect(a.inserted.period_end).toBe("2026-09-14");
    const b = await generate({ periodDays: 90 });
    expect(b.inserted.period_start).toBe("2026-06-17");
  });

  it("defaults to the 28-day window when nothing is specified", async () => {
    const { inserted } = await generate({});
    expect(inserted.period_start).toBe("2026-08-18");
  });
});
