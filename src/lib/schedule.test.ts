import { describe, it, expect } from "vitest";
import { nextRunAt, isFrequency } from "./schedule";

describe("isFrequency", () => {
  it("accepts valid cadences", () => {
    expect(isFrequency("weekly")).toBe(true);
    expect(isFrequency("monthly")).toBe(true);
    expect(isFrequency("quarterly")).toBe(true);
  });
  it("rejects anything else", () => {
    expect(isFrequency("daily")).toBe(false);
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
