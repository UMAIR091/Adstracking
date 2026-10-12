import { describe, expect, it } from "vitest";
import { assessDerivedSource, assessSnapshotSource, dominantWindow, ga4Has, snapshotWindow, sourceNotes, STALE_TOLERANCE_DAYS, type ReportSourceStatus } from "./dataQuality";

// Report period used throughout: a "last 28 days" generated 2026-10-12, which
// resolves to 13 Sep – 10 Oct (ends two days back).
const PERIOD = { start: "2026-09-13", end: "2026-10-10" };

describe("snapshotWindow", () => {
  it("uses the window the snapshot recorded", () => {
    expect(snapshotWindow({ window: { start: "2026-09-12", end: "2026-10-09" } }, "gsc", 28, "2026-10-12T06:00:00Z"))
      .toEqual({ start: "2026-09-12", end: "2026-10-09" });
  });

  it("infers an ad platform's window from the sync: through yesterday", () => {
    expect(snapshotWindow({ totals: {} }, "google_ads", 28, "2026-10-12T06:00:00+00:00"))
      .toEqual({ start: "2026-09-14", end: "2026-10-11" });
  });

  it("infers Search Console's longer lag", () => {
    expect(snapshotWindow({ totals: {} }, "gsc", 28, "2026-10-12T06:00:00Z")).toEqual({ start: "2026-09-12", end: "2026-10-09" });
  });

  it("returns null with neither a recorded window nor a sync time", () => {
    expect(snapshotWindow({ totals: {} }, "gsc", 28, null)).toBeNull();
  });
});

describe("assessSnapshotSource", () => {
  const base = { type: "meta_ads", periodDays: 28, period: PERIOD };

  it("includes a freshly synced snapshot", () => {
    const st = assessSnapshotSource({ ...base, connection: "connected", syncedAt: "2026-10-12T06:00:00Z", snapshot: { totals: {} } });
    expect(st).toMatchObject({ included: true, state: "ok", window: { start: "2026-09-14", end: "2026-10-11" } });
  });

  it("excludes a revoked source whose data stopped in August — the production case", () => {
    const st = assessSnapshotSource({ ...base, connection: "revoked", syncedAt: "2026-08-29T06:38:00Z", snapshot: { totals: {} } });
    expect(st).toMatchObject({ included: false, state: "stale", lastDataDate: "2026-08-28", connection: "revoked" });
  });

  it("keeps a source within the lag tolerance", () => {
    // Synced three days late: its data ends 2026-10-07, exactly the tolerance.
    const st = assessSnapshotSource({ ...base, syncedAt: "2026-10-08T06:00:00Z", snapshot: { totals: {} } });
    expect(STALE_TOLERANCE_DAYS).toBe(3);
    expect(st.included).toBe(true);
  });

  it("excludes one day past the tolerance", () => {
    const st = assessSnapshotSource({ ...base, syncedAt: "2026-10-07T06:00:00Z", snapshot: { totals: {} } });
    expect(st).toMatchObject({ included: false, state: "stale" });
  });

  it("marks a source with no snapshot as not synced", () => {
    expect(assessSnapshotSource({ ...base, snapshot: null })).toMatchObject({ included: false, state: "not_synced" });
  });
});

describe("assessDerivedSource", () => {
  const SEPT = { start: "2026-09-01", end: "2026-09-30" };
  const days = (from: number, to: number, month = "09") =>
    Array.from({ length: to - from + 1 }, (_, i) => `2026-${month}-${String(from + i).padStart(2, "0")}`);

  it("is ok when history covers the period", () => {
    expect(assessDerivedSource({ type: "gsc", dates: [...days(1, 31, "08"), ...days(1, 30)], period: SEPT }))
      .toMatchObject({ included: true, state: "ok", window: SEPT });
  });

  it("is partial when history starts inside the period", () => {
    expect(assessDerivedSource({ type: "gsc", dates: days(10, 30), period: SEPT }))
      .toMatchObject({ included: true, state: "partial", window: { start: "2026-09-10", end: "2026-09-30" } });
  });

  it("is partial when history stops well before the period ends", () => {
    expect(assessDerivedSource({ type: "meta_ads", connection: "revoked", dates: [...days(1, 31, "08"), ...days(1, 20)], period: SEPT }))
      .toMatchObject({ included: true, state: "partial", window: { start: "2026-09-01", end: "2026-09-20" } });
  });

  it("is excluded when nothing falls in the period, naming where its data ends", () => {
    expect(assessDerivedSource({ type: "meta_ads", dates: days(5, 22, "08"), period: SEPT }))
      .toMatchObject({ included: false, state: "no_data", lastDataDate: "2026-08-22" });
  });
});

describe("sourceNotes", () => {
  it("names excluded, partial and differently-dated sources in plain sentences", () => {
    const notes = sourceNotes(
      [
        { type: "gsc", name: "Google Search Console", included: true, state: "ok", window: { start: "2026-09-12", end: "2026-10-09" }, syncedAt: null, connection: "connected" },
        { type: "google_ads", name: "Google Ads", included: true, state: "ok", window: { start: "2026-09-14", end: "2026-10-11" }, syncedAt: null, connection: "connected" },
        { type: "meta_ads", name: "Meta Ads", included: false, state: "stale", window: { start: "2026-08-01", end: "2026-08-28" }, lastDataDate: "2026-08-28", syncedAt: "2026-08-29T06:38:00Z", connection: "revoked" },
      ],
      PERIOD
    );
    expect(notes[0]).toBe(
      "Meta Ads is not included: its latest data ends 2026-08-28 (last refreshed 2026-08-29), and its connection has been revoked — reconnect it to include it again. Its figures would describe a different period."
    );
    expect(notes.slice(1)).toEqual([
      "Google Search Console figures cover 2026-09-12 to 2026-10-09 — each platform finalises its data on its own delay.",
      "Google Ads figures cover 2026-09-14 to 2026-10-11 — each platform finalises its data on its own delay.",
    ]);
  });

  it("names only the sources whose window differs from the stated period", () => {
    const notes = sourceNotes(
      [
        { type: "gsc", name: "Google Search Console", included: true, state: "ok", window: { start: "2026-09-12", end: "2026-10-09" }, syncedAt: null, connection: null },
        { type: "google_ads", name: "Google Ads", included: true, state: "ok", window: { start: "2026-09-14", end: "2026-10-11" }, syncedAt: null, connection: null },
      ],
      { start: "2026-09-14", end: "2026-10-11" }
    );
    expect(notes).toEqual(["Google Search Console figures cover 2026-09-12 to 2026-10-09 — each platform finalises its data on its own delay."]);
  });

  it("is silent when every source covers exactly the period", () => {
    expect(sourceNotes([{ type: "gsc", name: "GSC", included: true, state: "ok", window: PERIOD, syncedAt: null, connection: null }], PERIOD)).toEqual([]);
  });

  it("is silent for reports generated before sources were recorded", () => {
    expect(sourceNotes(undefined, PERIOD)).toEqual([]);
  });
});

describe("dominantWindow", () => {
  const src = (type: string, start: string, end: string, included = true): ReportSourceStatus =>
    ({ type, name: type, included, state: included ? "ok" : "stale", window: { start, end }, syncedAt: null, connection: null });

  it("picks the window most sources share", () => {
    expect(dominantWindow([
      src("gsc", "2026-09-12", "2026-10-09"),
      src("google_ads", "2026-09-14", "2026-10-11"),
      src("linkedin_ads", "2026-09-14", "2026-10-11"),
    ])).toEqual({ start: "2026-09-14", end: "2026-10-11" });
  });

  it("prefers the latest window on a tie, and ignores excluded sources", () => {
    expect(dominantWindow([
      src("gsc", "2026-09-12", "2026-10-09"),
      src("google_ads", "2026-09-14", "2026-10-11"),
      src("meta_ads", "2026-08-01", "2026-08-28", false),
      src("instagram", "2026-08-01", "2026-08-28", false),
    ])).toEqual({ start: "2026-09-14", end: "2026-10-11" });
  });

  it("is null when no included source knows its window", () => {
    expect(dominantWindow([])).toBeNull();
  });
});

describe("ga4Has", () => {
  it("is false for a listed unavailable metric and for no GA4 at all", () => {
    expect(ga4Has({ unavailableMetrics: ["users", "conversions"] }, "conversions")).toBe(false);
    expect(ga4Has({ unavailableMetrics: ["users"] }, "sessions")).toBe(true);
    expect(ga4Has({}, "conversions")).toBe(true);
    expect(ga4Has(null, "sessions")).toBe(false);
  });
});
