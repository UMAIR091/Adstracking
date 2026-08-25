// Pure scheduling helpers shared by the schedules API and the delivery cron.

import { PERIOD_PRESETS, isPeriodPreset, type PeriodPreset } from "@/lib/reports/periods";

export const FREQUENCIES = ["daily", "weekly", "biweekly", "monthly", "quarterly"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export function isFrequency(v: unknown): v is Frequency {
  return typeof v === "string" && (FREQUENCIES as readonly string[]).includes(v);
}

/**
 * The reporting period each cadence covers by DEFAULT, when the schedule
 * doesn't name one (see periodForSchedule).
 *
 * Every scheduled report used to be generated with the default 28-day window
 * regardless of frequency, so a monthly delivery reported 28 rolling days
 * (never a calendar month) and a quarterly one reported 28 days out of ~90.
 * Each cadence now reports the block that just finished:
 *
 *   weekly    → the previous 7 days
 *   biweekly  → the previous 14 days
 *   monthly   → the previous CALENDAR month
 *   quarterly → the previous CALENDAR quarter
 *
 * Monthly and quarterly are deliberately calendar, not rolling: "your August
 * report" has to mean August.
 *
 * Daily is the one exception to "the block that just finished". A single day is
 * too thin to report on — weekends read as dead, and paid media has not
 * finished attributing yesterday by the time a morning send goes out — so a
 * daily send defaults to the trailing week. An agency that wants a true
 * one-day pulse can say so explicitly with the period picker.
 */
export function periodForFrequency(f: Frequency): PeriodPreset {
  switch (f) {
    case "daily": return "last_7";
    case "weekly": return "last_7";
    case "biweekly": return "last_14";
    case "quarterly": return "previous_quarter";
    case "monthly":
    default: return "previous_month";
  }
}

/**
 * The windows a schedule may be pinned to.
 *
 * "custom" is excluded deliberately: a fixed start/end pair on a RECURRING
 * schedule would email the same frozen date range every time, which is never
 * what someone means by scheduling a report.
 */
export const SCHEDULE_PERIODS = PERIOD_PRESETS.filter((p) => p.id !== "custom");

export function isSchedulePeriod(v: unknown): v is PeriodPreset {
  return isPeriodPreset(v) && v !== "custom";
}

/**
 * The window a scheduled delivery reports on: the agency's explicit choice when
 * there is one, otherwise the cadence default.
 *
 * Stored as NULL for "match the frequency", so every schedule created before
 * the picker existed keeps behaving exactly as it did — and so a later change
 * to a cadence's default reaches the schedules that never opted out.
 */
export function periodForSchedule(frequency: Frequency, period: unknown): PeriodPreset {
  return isSchedulePeriod(period) ? period : periodForFrequency(frequency);
}

// Next delivery time strictly after `from`, honoring the chosen day and hour
// (UTC). For weekly, sendDay is 0–6 (Sun–Sat); for monthly/quarterly it's the
// day of month (clamped 1–28 so it exists in every month). Daily ignores
// sendDay entirely — every day is the day. sendHour is 0–23.
export function nextRunAt(
  frequency: Frequency,
  from: Date = new Date(),
  sendDay?: number | null,
  sendHour?: number | null
): string {
  const hour = clamp(sendHour ?? 8, 0, 23);

  if (frequency === "daily") {
    const d = new Date(from);
    d.setUTCHours(hour, 0, 0, 0);
    if (d <= from) d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString();
  }

  if (frequency === "weekly" || frequency === "biweekly") {
    const targetDow = clamp(sendDay ?? 1, 0, 6);
    const d = new Date(from);
    d.setUTCHours(hour, 0, 0, 0);
    let diff = (targetDow - d.getUTCDay() + 7) % 7;
    if (diff === 0 && d <= from) diff = 7;
    // Biweekly lands on the same weekday a fortnight out. Advancing from NOW
    // (as the caller does) keeps a late run from replaying a backlog.
    if (frequency === "biweekly") diff += 7;
    d.setUTCDate(d.getUTCDate() + diff);
    return d.toISOString();
  }

  const monthsAhead = frequency === "quarterly" ? 3 : 1;
  const dom = clamp(sendDay ?? 1, 1, 28);
  const cand = new Date(from);
  cand.setUTCDate(dom);
  cand.setUTCHours(hour, 0, 0, 0);
  if (cand <= from) {
    cand.setUTCMonth(cand.getUTCMonth() + monthsAhead);
    cand.setUTCDate(dom);
    cand.setUTCHours(hour, 0, 0, 0);
  }
  return cand.toISOString();
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(Math.round(n), lo), hi);
}

export function frequencyLabel(f: Frequency): string {
  return f === "daily" ? "Every day"
    : f === "weekly" ? "Every week"
    : f === "biweekly" ? "Every 2 weeks"
    : f === "quarterly" ? "Every quarter"
    : "Every month";
}
