import { describe, expect, it } from "vitest";
import {
  resolvePeriod, previousWindow, dayCount, addDays, isIsoDate, isPeriodPreset, latestSettledDay,
  CACHED_PERIOD_DAYS, cachedPeriodLabel, isCachedPeriodDays,
  type PeriodPreset,
} from "./periods";

// A fixed "now": Wednesday 16 September 2026, 12:00 UTC.
// Settled day = 14 September 2026 (2-day provider lag).
const NOW = Date.parse("2026-09-16T12:00:00Z");
const ok = (preset: PeriodPreset, extra: Record<string, unknown> = {}) => {
  const r = resolvePeriod({ preset, now: NOW, ...extra });
  if (!r.ok) throw new Error(`expected ok, got: ${r.error}`);
  return r.period;
};

describe("rolling periods", () => {
  it("ends at the last settled day, not today", () => {
    expect(latestSettledDay(NOW)).toBe("2026-09-14");
    expect(ok("last_7").end).toBe("2026-09-14");
  });

  it.each([
    ["last_7", 7, "2026-09-08"],
    ["last_14", 14, "2026-09-01"],
    ["last_28", 28, "2026-08-18"],
    ["last_30", 30, "2026-08-16"],
    ["last_90", 90, "2026-06-17"],
  ] as const)("%s spans exactly %i inclusive days", (preset, days, start) => {
    const p = ok(preset);
    expect(p.start).toBe(start);
    expect(p.days).toBe(days);
    expect(dayCount(p.start, p.end)).toBe(days);
    expect(p.kind).toBe("rolling");
  });

  it("distinguishes 28 and 30 days rather than treating them as the same", () => {
    expect(ok("last_28").start).not.toBe(ok("last_30").start);
  });

  it("compares against the equal-length block immediately before", () => {
    const prev = previousWindow(ok("last_7"));
    expect(prev).toEqual({ start: "2026-09-01", end: "2026-09-07" });
    expect(dayCount(prev.start, prev.end)).toBe(7);
  });
});

describe("calendar periods", () => {
  it("previous month is the real calendar month, not the last 28 or 30 days", () => {
    const p = ok("previous_month");
    expect(p.start).toBe("2026-08-01");
    expect(p.end).toBe("2026-08-31");
    expect(p.days).toBe(31);
    expect(p.label).toBe("August 2026");
    expect(p.kind).toBe("calendar");
    expect(p.inProgress).toBe(false);
    // The bug this replaces: neither rolling window equals August.
    expect(p.start).not.toBe(ok("last_28").start);
    expect(p.start).not.toBe(ok("last_30").start);
  });

  it("a completed month keeps its real end date regardless of the lag", () => {
    // Asked on 2 September, August still ends on the 31st.
    const r = resolvePeriod({ preset: "previous_month", now: Date.parse("2026-09-02T09:00:00Z") });
    expect(r.ok && r.period.end).toBe("2026-08-31");
  });

  it("this month runs from the 1st to the last settled day and is marked in progress", () => {
    const p = ok("this_month");
    expect(p.start).toBe("2026-09-01");
    expect(p.end).toBe("2026-09-14");
    expect(p.days).toBe(14);
    expect(p.inProgress).toBe(true);
  });

  it("previous quarter is a real quarter", () => {
    const p = ok("previous_quarter");
    expect(p.start).toBe("2026-04-01");
    expect(p.end).toBe("2026-06-30");
    expect(p.label).toBe("Q2 2026");
    expect(p.days).toBe(91);
  });

  it("this quarter starts at the quarter boundary", () => {
    const p = ok("this_quarter");
    expect(p.start).toBe("2026-07-01");
    expect(p.end).toBe("2026-09-14");
    expect(p.inProgress).toBe(true);
  });

  it("rolls back across a year boundary", () => {
    const jan = Date.parse("2026-01-10T12:00:00Z");
    const m = resolvePeriod({ preset: "previous_month", now: jan });
    expect(m.ok && m.period.start).toBe("2025-12-01");
    expect(m.ok && m.period.end).toBe("2025-12-31");
    const q = resolvePeriod({ preset: "previous_quarter", now: jan });
    expect(q.ok && q.period.start).toBe("2025-10-01");
    expect(q.ok && q.period.end).toBe("2025-12-31");
    expect(q.ok && q.period.label).toBe("Q4 2025");
  });

  it("handles February in a leap year", () => {
    const r = resolvePeriod({ preset: "previous_month", now: Date.parse("2028-03-05T12:00:00Z") });
    expect(r.ok && r.period.end).toBe("2028-02-29");
    expect(r.ok && r.period.days).toBe(29);
  });

  it("fails rather than inventing a window when this month has no settled days", () => {
    // 1 September: the settled day is still in August, so September has none.
    const r = resolvePeriod({ preset: "this_month", now: Date.parse("2026-09-01T10:00:00Z") });
    expect(r.ok).toBe(false);
  });

  it("compares a completed month against the whole previous month", () => {
    expect(previousWindow(ok("previous_month"))).toEqual({ start: "2026-07-01", end: "2026-07-31" });
  });

  it("compares a part-month against the same number of days of the month before", () => {
    // 14 days of September vs the first 14 days of August, not all of August.
    expect(previousWindow(ok("this_month"))).toEqual({ start: "2026-08-01", end: "2026-08-14" });
  });
});

describe("custom ranges", () => {
  it("accepts a valid settled range", () => {
    const p = ok("custom", { customStart: "2026-08-03", customEnd: "2026-08-09" });
    expect(p.days).toBe(7);
    expect(p.kind).toBe("custom");
  });

  it("rejects a reversed range", () => {
    const r = resolvePeriod({ preset: "custom", customStart: "2026-08-09", customEnd: "2026-08-03", now: NOW });
    expect(r.ok).toBe(false);
  });

  it("rejects an end date beyond settled data instead of clamping it", () => {
    const r = resolvePeriod({ preset: "custom", customStart: "2026-09-01", customEnd: "2026-09-16", now: NOW });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toMatch(/2026-09-14/);
  });

  it("rejects malformed and impossible dates", () => {
    for (const [s, e] of [["2026-13-01", "2026-09-01"], ["2026-02-30", "2026-09-01"], ["not-a-date", "2026-09-01"], ["", ""]]) {
      expect(resolvePeriod({ preset: "custom", customStart: s, customEnd: e, now: NOW }).ok).toBe(false);
    }
  });

  it("rejects a missing bound rather than defaulting it", () => {
    expect(resolvePeriod({ preset: "custom", customStart: "2026-08-01", customEnd: null, now: NOW }).ok).toBe(false);
  });
});

describe("helpers", () => {
  it("validates ISO dates including impossible ones", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-2-8")).toBe(false);
  });

  it("counts inclusive days and rejects reversed ranges", () => {
    expect(dayCount("2026-08-01", "2026-08-01")).toBe(1);
    expect(dayCount("2026-08-31", "2026-08-01")).toBe(0);
  });

  it("adds days across month boundaries", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("recognises only known presets", () => {
    expect(isPeriodPreset("previous_month")).toBe(true);
    expect(isPeriodPreset("last_45")).toBe(false);
  });
});

// The client Performance view reads cached snapshots directly instead of
// deriving, so it may only offer windows the sync actually stores. These guard
// the contract between lib/sync's PERIODS and that picker.
describe("cached snapshot windows", () => {
  it("every cached window has a matching rolling preset", () => {
    for (const days of CACHED_PERIOD_DAYS) {
      expect(isPeriodPreset(`last_${days}`)).toBe(true);
      expect(ok(`last_${days}` as PeriodPreset).days).toBe(days);
    }
  });

  it("labels a cached window exactly as the report picker does", () => {
    expect(cachedPeriodLabel(28)).toBe("Last 28 days");
    expect(cachedPeriodLabel(90)).toBe("Last 90 days");
  });

  it("accepts only the stored windows, from strings or numbers", () => {
    expect(isCachedPeriodDays("28")).toBe(true);
    expect(isCachedPeriodDays(90)).toBe(true);
    // A window nothing is stored for must fall back, never silently render
    // another period's numbers under its name.
    expect(isCachedPeriodDays("30")).toBe(false);
    expect(isCachedPeriodDays(undefined)).toBe(false);
    expect(isCachedPeriodDays("")).toBe(false);
    expect(isCachedPeriodDays("banana")).toBe(false);
  });
});
