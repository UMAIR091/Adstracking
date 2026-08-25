// The reports cron's heartbeat is the ONLY evidence that the job ran: when no
// schedules are due, the run has no other side effect at all. It was previously
// fire-and-forget, which on a serverless runtime can be dropped when the
// instance freezes after the response — making a successful run look identical
// to one that never happened.
//
// These tests pin the two properties that ambiguity cost us:
//   1. the heartbeat is genuinely awaited — it has completed by the time the
//      handler resolves, not merely been started;
//   2. a failing heartbeat never turns a successful run into a 500.
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

const runScheduledReports = vi.fn();
const cronAuthorized = vi.fn();
const rpc = vi.fn();
const logRouteError = vi.fn(async (_c: string, e: unknown) => (e as Error).message);

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));
vi.mock("@/lib/cronAuth", () => ({ cronAuthorized: (r: Request) => cronAuthorized(r) }));
vi.mock("@/lib/scheduledReports", () => ({
  runScheduledReports: (...a: unknown[]) => runScheduledReports(...a),
  scheduleBatchSize: () => 50,
}));
vi.mock("@/lib/errorLog", () => ({ logRouteError: (c: string, e: unknown) => logRouteError(c, e) }));

// Imported inside beforeAll rather than at the top: a static import would be
// evaluated before the mock factories above can capture these spies, and a
// top-level await isn't permitted under this tsconfig's module target.
let GET: (req: Request) => Promise<Response>;
beforeAll(async () => {
  ({ GET } = await import("./route"));
});

const req = () => new Request("https://example.com/api/cron/reports");
const RESULT = { processed: 0, sent: 0, failed: 0, skipped: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  cronAuthorized.mockReturnValue(true);
  runScheduledReports.mockResolvedValue(RESULT);
  rpc.mockResolvedValue({ error: null });
});

describe("reports cron heartbeat", () => {
  it("has finished writing the heartbeat before the handler resolves", async () => {
    let heartbeatSettled = false;
    rpc.mockImplementation(async (fn: string) => {
      if (fn === "record_heartbeat") {
        // Defer past several microtask ticks. A fire-and-forget call would let
        // the handler return while this is still pending.
        await new Promise((r) => setTimeout(r, 10));
        heartbeatSettled = true;
      }
      return { error: null };
    });

    const res = await GET(req());

    expect(heartbeatSettled).toBe(true);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, heartbeat: "ok" });
  });

  it("records the run outcome in the heartbeat detail", async () => {
    runScheduledReports.mockResolvedValue({ processed: 3, sent: 2, failed: 1, skipped: 0 });

    await GET(req());

    expect(rpc).toHaveBeenCalledWith("record_heartbeat", {
      p_job: "reports",
      p_ok: true,
      p_detail: "sent 2 failed 1",
    });
  });

  it("still returns 200 when the heartbeat RPC returns an error", async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === "record_heartbeat" ? { error: { message: "rpc unavailable" } } : { error: null }
    );

    const res = await GET(req());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, heartbeat: "failed" });
  });

  it("still returns 200 when the heartbeat RPC throws", async () => {
    rpc.mockImplementation(async (fn: string) => {
      if (fn === "record_heartbeat") throw new Error("network down");
      return { error: null };
    });

    const res = await GET(req());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, heartbeat: "failed" });
  });

  it("leaves the surrounding cron behaviour untouched", async () => {
    // Auth still gates the route, and a failing run still reports 500 through
    // the existing error path rather than being masked by the heartbeat change.
    cronAuthorized.mockReturnValue(false);
    const unauthorized = await GET(req());
    expect(unauthorized.status).toBe(401);
    expect(runScheduledReports).not.toHaveBeenCalled();

    cronAuthorized.mockReturnValue(true);
    runScheduledReports.mockRejectedValue(new Error("claim failed"));
    const failed = await GET(req());
    expect(failed.status).toBe(500);
    expect(logRouteError).toHaveBeenCalledWith("cron", expect.any(Error));
  });

  // This used to assert the opposite — that a failed run writes no heartbeat.
  // That silence is exactly what hid a cron failing every day for weeks:
  // logRouteError only reaches the console when the event carries no agency,
  // and a batch-level crash here never resolves one, so the message was gone
  // with the hour of runtime-log retention. The failure now leaves a row.
  it("records the failure as a heartbeat, carrying the error message", async () => {
    runScheduledReports.mockRejectedValue(new Error("claim failed"));
    logRouteError.mockResolvedValue("claim failed");

    const res = await GET(req());

    expect(res.status).toBe(500);
    expect(rpc).toHaveBeenCalledWith("record_heartbeat", {
      p_job: "reports",
      p_ok: false,
      p_detail: "claim failed",
    });
  });

  it("still returns the original error when the failure heartbeat itself throws", async () => {
    runScheduledReports.mockRejectedValue(new Error("claim failed"));
    logRouteError.mockResolvedValue("claim failed");
    rpc.mockImplementation(async (fn: string) => {
      if (fn === "record_heartbeat") throw new Error("network down");
      return { error: null };
    });

    const res = await GET(req());

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: "claim failed" });
  });
});
