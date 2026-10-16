import { describe, expect, it } from "vitest";
import { xDayChunks, xLocalMidnight, X_MAX_SPAN_DAYS } from "./xads";

// X's stats endpoint rejects (verified 16 Oct 2026) any DAY window that does
// not start and end at midnight in the AD ACCOUNT's time zone, and any single
// request longer than 7 days. These pin both rules.

describe("xLocalMidnight", () => {
  it("is midnight in the account's own zone, not UTC", () => {
    expect(xLocalMidnight("2026-10-08", "Asia/Karachi")).toBe("2026-10-08T00:00:00+05:00");
    expect(xLocalMidnight("2026-10-08", "Asia/Kolkata")).toBe("2026-10-08T00:00:00+05:30");
    expect(xLocalMidnight("2026-10-08", "UTC")).toBe("2026-10-08T00:00:00+00:00");
  });

  it("follows daylight saving, including on the change days", () => {
    expect(xLocalMidnight("2026-07-01", "America/New_York")).toBe("2026-07-01T00:00:00-04:00");
    expect(xLocalMidnight("2026-12-01", "America/New_York")).toBe("2026-12-01T00:00:00-05:00");
    // Clocks change at 02:00, so midnight on each change day is still the old offset.
    expect(xLocalMidnight("2026-03-08", "America/New_York")).toBe("2026-03-08T00:00:00-05:00");
    expect(xLocalMidnight("2026-11-01", "America/New_York")).toBe("2026-11-01T00:00:00-04:00");
    expect(xLocalMidnight("2026-03-29", "Europe/London")).toBe("2026-03-29T00:00:00+00:00");
    expect(xLocalMidnight("2026-10-25", "Europe/London")).toBe("2026-10-25T00:00:00+01:00");
  });
});

describe("xDayChunks", () => {
  const days = (n: number) =>
    Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 8, 1) + i * 86_400_000).toISOString().slice(0, 10));

  it("splits 28 and 90 days into runs X accepts, losing none", () => {
    for (const n of [28, 90]) {
      const chunks = xDayChunks(days(n));
      expect(chunks.flat()).toEqual(days(n));
      expect(chunks.every((c) => c.length >= 1 && c.length <= X_MAX_SPAN_DAYS)).toBe(true);
    }
    expect(xDayChunks(days(28)).length).toBe(4);
    expect(xDayChunks(days(90)).length).toBe(13);
  });

  it("keeps every request within X's 7 days + 1 hour, even across a DST change", () => {
    const span = days(90);
    for (const chunk of xDayChunks(span)) {
      const last = chunk[chunk.length - 1];
      const after = new Date(Date.parse(`${last}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
      const ms = Date.parse(xLocalMidnight(after, "America/New_York")) - Date.parse(xLocalMidnight(chunk[0], "America/New_York"));
      expect(ms).toBeLessThanOrEqual(7 * 86_400_000 + 3_600_000);
    }
  });
});
