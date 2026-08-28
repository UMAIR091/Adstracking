// The health endpoint is what an uptime monitor reads, so what it scores into
// `status` decides whether anyone finds out about a broken job.
//
// It used to score only database reachability and cron STALENESS. That misses
// the failure mode that actually happened: the reports cron threw on every run
// for weeks, but it threw ON SCHEDULE, so `last_run_at` stayed fresh, nothing
// looked stale, and `status` read "ok" throughout. These tests pin that a job
// which ran and failed is degraded.
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

type Heartbeat = { job: string; last_run_at: string; ok: boolean | null; detail: string | null };

let heartbeats: Heartbeat[] = [];
let dbFails = false;

// Mirrors the two calls the route makes: a head-count probe on report_templates
// for database reachability, then a select on ops_heartbeats.
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => {
        if (table === "report_templates") {
          const probe = {
            limit: async () => ({ error: dbFails ? { message: "down" } : null }),
          };
          return probe;
        }
        return Promise.resolve({ data: heartbeats, error: null });
      },
    }),
  }),
}));
vi.mock("@/lib/monitoring", () => ({ monitoringConfigured: () => true }));

let GET: () => Promise<Response>;
beforeAll(async () => {
  ({ GET } = await import("./route"));
});

const fresh = () => new Date().toISOString();
const body = async () =>
  (await (await GET()).json()) as {
    status: string;
    checks: { database: string; crons: Record<string, { lastRunAt: string | null; stale: boolean; ok: boolean; detail: string | null }> };
  };

beforeEach(() => {
  vi.clearAllMocks();
  dbFails = false;
  heartbeats = [];
});

describe("health status scoring", () => {
  it("is ok when every cron ran recently and succeeded", async () => {
    heartbeats = [
      { job: "sync", last_run_at: fresh(), ok: true, detail: "claimed 6" },
      { job: "reports", last_run_at: fresh(), ok: true, detail: "sent 1 failed 0" },
    ];

    const b = await body();

    expect(b.status).toBe("ok");
    expect(b.checks.crons.reports.ok).toBe(true);
  });

  it("is degraded when the reports cron ran and FAILED", async () => {
    // The real incident: fresh timestamp, so nothing is stale — but the run
    // threw. This read as "ok" before.
    heartbeats = [
      { job: "sync", last_run_at: fresh(), ok: true, detail: "claimed 6" },
      { job: "reports", last_run_at: fresh(), ok: false, detail: 'column reference "schedule_id" is ambiguous' },
    ];

    const b = await body();

    expect(b.status).not.toBe("ok");
    expect(b.status).toBe("degraded");
  });

  it("keeps the full detail when degraded, so the reason is readable", async () => {
    heartbeats = [
      { job: "sync", last_run_at: "2026-08-25T06:52:50.000Z", ok: true, detail: "claimed 6" },
      { job: "reports", last_run_at: "2026-08-25T08:50:27.000Z", ok: false, detail: "boom" },
    ];

    const b = await body();

    expect(b.status).toBe("degraded");
    // Degrading must not cost the diagnosis — every field survives.
    expect(b.checks.database).toBe("ok");
    expect(b.checks.crons.reports).toMatchObject({
      lastRunAt: "2026-08-25T08:50:27.000Z",
      ok: false,
      detail: "boom",
    });
    expect(b.checks.crons.sync).toMatchObject({ ok: true, detail: "claimed 6" });
  });

  it("degrades on any failing job, not just reports", async () => {
    heartbeats = [{ job: "sync", last_run_at: fresh(), ok: false, detail: "claim failed" }];
    expect((await body()).status).toBe("degraded");
  });

  it("still degrades on a stale-but-successful job", async () => {
    // Pre-existing behaviour, retained: last run succeeded, but days ago.
    heartbeats = [{ job: "reports", last_run_at: "2020-01-01T00:00:00.000Z", ok: true, detail: "sent 0 failed 0" }];

    const b = await body();

    expect(b.status).toBe("degraded");
    expect(b.checks.crons.reports.stale).toBe(true);
  });

  it("treats a null ok as healthy, so a pre-existing row isn't a false alarm", async () => {
    // Rows written before the ok column was populated read as null.
    heartbeats = [{ job: "sync", last_run_at: fresh(), ok: null, detail: null }];

    const b = await body();

    expect(b.checks.crons.sync.ok).toBe(true);
    expect(b.status).toBe("ok");
  });

  it("is ok with no heartbeat rows at all", async () => {
    heartbeats = [];
    expect((await body()).status).toBe("ok");
  });

  it("still reports 503 when the database itself is unreachable", async () => {
    // Unchanged by this fix, and the one case that returns a failing HTTP code.
    dbFails = true;
    const res = await GET();
    expect(res.status).toBe(503);
    expect((await res.json()).status).toBe("degraded");
  });

  it("returns 200 for a failing cron — degraded is in the body, not the HTTP code", async () => {
    // Deliberate: only the database check fails the request. A monitor that
    // watches HTTP alone still won't page on a broken cron; one that reads
    // `status` will. Pinned so the distinction is a decision, not an accident.
    heartbeats = [{ job: "reports", last_run_at: fresh(), ok: false, detail: "boom" }];
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("degraded");
  });
});
