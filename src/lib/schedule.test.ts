import { describe, it, expect } from "vitest";
import { nextRunAt, isFrequency, periodForFrequency, periodForSchedule, isSchedulePeriod, SCHEDULE_PERIODS } from "./schedule";
import { resolvePeriod } from "./reports/periods";

describe("isFrequency", () => {
  it("accepts valid cadences", () => {
    expect(isFrequency("daily")).toBe(true);
    expect(isFrequency("weekly")).toBe(true);
    expect(isFrequency("monthly")).toBe(true);
    expect(isFrequency("quarterly")).toBe(true);
  });
  it("rejects anything else", () => {
    expect(isFrequency("hourly")).toBe(false);
    expect(isFrequency("")).toBe(false);
    expect(isFrequency(null)).toBe(false);
  });
});

describe("nextRunAt", () => {
  it("returns a time strictly after `from`", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    for (const f of ["weekly", "monthly", "quarterly"] as const) {
      const next = new Date(nextRunAt(f, from, 1, 8));
      expect(next.getTime()).toBeGreaterThan(from.getTime());
    }
  });

  it("weekly lands on the requested day-of-week + hour (UTC)", () => {
    // Wed 2026-01-07; ask for Monday(1) 09:00 → next Monday.
    const from = new Date("2026-01-07T00:00:00Z");
    const next = new Date(nextRunAt("weekly", from, 1, 9));
    expect(next.getUTCDay()).toBe(1);
    expect(next.getUTCHours()).toBe(9);
  });

  it("monthly clamps day-of-month to <= 28 so it exists every month", () => {
    const from = new Date("2026-01-15T00:00:00Z");
    const next = new Date(nextRunAt("monthly", from, 31, 8));
    expect(next.getUTCDate()).toBeLessThanOrEqual(28);
  });

  it("quarterly advances ~3 months when the day has passed", () => {
    const from = new Date("2026-01-20T00:00:00Z");
    const next = new Date(nextRunAt("quarterly", from, 1, 8));
    expect(next.getTime()).toBeGreaterThan(from.getTime());
    // At least into a later month.
    expect(next.getUTCMonth()).not.toBe(from.getUTCMonth());
  });
});

// ── Phase 2A: cadence → reporting period ────────────────────────────────────
//
// Every scheduled report used to be generated with the default 28-day window
// whatever the cadence, so a "monthly" report covered 28 rolling days ending
// mid-month and a quarterly one covered 28 days out of ~90. These pin the
// mapping that replaced it.
describe("periodForFrequency", () => {
  it("maps weekly to the previous 7 days", () => {
    expect(periodForFrequency("weekly")).toBe("last_7");
  });

  it("maps biweekly to the previous 14 days", () => {
    expect(periodForFrequency("biweekly")).toBe("last_14");
  });

  it("maps monthly to the previous CALENDAR month, not 28 or 30 rolling days", () => {
    const preset = periodForFrequency("monthly");
    expect(preset).toBe("previous_month");
    expect(preset).not.toBe("last_28");
    expect(preset).not.toBe("last_30");
  });

  it("maps quarterly to the previous CALENDAR quarter, not 90 rolling days", () => {
    const preset = periodForFrequency("quarterly");
    expect(preset).toBe("previous_quarter");
    expect(preset).not.toBe("last_90");
  });

  it("resolves each cadence to a window matching its name", () => {
    // Generated on 3 September 2026 — the day a monthly schedule would fire.
    const now = Date.parse("2026-09-03T08:00:00Z");
    const win = (f: Parameters<typeof periodForFrequency>[0]) => {
      const r = resolvePeriod({ preset: periodForFrequency(f), now });
      if (!r.ok) throw new Error(r.error);
      return r.period;
    };
    expect(win("weekly").days).toBe(7);
    expect(win("biweekly").days).toBe(14);
    // August, in full — not 6 Aug–2 Sep, which is what 28 rolling days gave.
    expect(win("monthly").start).toBe("2026-08-01");
    expect(win("monthly").end).toBe("2026-08-31");
    expect(win("quarterly").start).toBe("2026-04-01");
    expect(win("quarterly").end).toBe("2026-06-30");
  });
});

describe("biweekly scheduling", () => {
  it("is a recognised cadence", () => {
    expect(isFrequency("biweekly")).toBe(true);
  });

  it("lands a fortnight out rather than a week", () => {
    const from = new Date("2026-09-01T00:00:00Z"); // Tuesday
    const weekly = new Date(nextRunAt("weekly", from, 1, 8));   // next Monday
    const biweekly = new Date(nextRunAt("biweekly", from, 1, 8));
    expect(biweekly.getTime() - weekly.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    expect(biweekly.getUTCDay()).toBe(1);
  });

  it("still returns a time strictly after `from`", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    expect(new Date(nextRunAt("biweekly", from, 1, 8)).getTime()).toBeGreaterThan(from.getTime());
  });
});

describe("daily scheduling", () => {
  it("is a recognised cadence", () => {
    expect(isFrequency("daily")).toBe(true);
  });

  it("lands on the next occurrence of the chosen hour", () => {
    const from = new Date("2026-09-01T06:00:00Z");
    const next = new Date(nextRunAt("daily", from, null, 11));
    expect(next.toISOString()).toBe("2026-09-01T11:00:00.000Z");
  });

  it("rolls to tomorrow once today's hour has passed", () => {
    const from = new Date("2026-09-01T12:00:00Z");
    const next = new Date(nextRunAt("daily", from, null, 11));
    expect(next.toISOString()).toBe("2026-09-02T11:00:00.000Z");
  });

  it("advances exactly one day, not one week", () => {
    const from = new Date("2026-09-01T00:00:00Z");
    const first = new Date(nextRunAt("daily", from, null, 8));
    const second = new Date(nextRunAt("daily", first, null, 8));
    expect(second.getTime() - first.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("ignores sendDay — every day is the day", () => {
    const from = new Date("2026-09-01T00:00:00Z");
    expect(nextRunAt("daily", from, 5, 8)).toBe(nextRunAt("daily", from, null, 8));
  });

  it("defaults to the trailing week, not a single thin day", () => {
    expect(periodForFrequency("daily")).toBe("last_7");
  });
});

// The cadence picks a default window; the schedule may override it. Null means
// "match the frequency", which is what every schedule created before the picker
// existed stores.
describe("periodForSchedule", () => {
  it("falls back to the cadence default when nothing is pinned", () => {
    expect(periodForSchedule("monthly", null)).toBe("previous_month");
    expect(periodForSchedule("daily", null)).toBe("last_7");
    expect(periodForSchedule("quarterly", undefined)).toBe("previous_quarter");
  });

  it("honours an explicit window over the cadence default", () => {
    expect(periodForSchedule("daily", "previous_month")).toBe("previous_month");
    expect(periodForSchedule("monthly", "last_7")).toBe("last_7");
  });

  it("ignores anything that isn't a usable preset", () => {
    expect(periodForSchedule("weekly", "nonsense")).toBe("last_7");
    expect(periodForSchedule("monthly", "")).toBe("previous_month");
    expect(periodForSchedule("monthly", 7)).toBe("previous_month");
  });

  it("refuses custom — a frozen date range cannot recur", () => {
    expect(isSchedulePeriod("custom")).toBe(false);
    expect(periodForSchedule("monthly", "custom")).toBe("previous_month");
    expect(SCHEDULE_PERIODS.some((p) => p.id === "custom")).toBe(false);
  });

  it("offers every non-custom preset to pick from", () => {
    expect(SCHEDULE_PERIODS.length).toBeGreaterThan(0);
    for (const p of SCHEDULE_PERIODS) expect(isSchedulePeriod(p.id)).toBe(true);
  });
});
