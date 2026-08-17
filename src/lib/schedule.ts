// Pure scheduling helpers shared by the schedules API and the delivery cron.

export const FREQUENCIES = ["weekly", "biweekly", "monthly", "quarterly"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export function isFrequency(v: unknown): v is Frequency {
  return typeof v === "string" && (FREQUENCIES as readonly string[]).includes(v);
}

/**
 * The reporting period each cadence should cover.
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
 */
export function periodForFrequency(f: Frequency): "last_7" | "last_14" | "previous_month" | "previous_quarter" {
  switch (f) {
    case "weekly": return "last_7";
    case "biweekly": return "last_14";
    case "quarterly": return "previous_quarter";
    case "monthly":
    default: return "previous_month";
  }
}

// Next delivery time strictly after `from`, honoring the chosen day and hour
// (UTC). For weekly, sendDay is 0–6 (Sun–Sat); for monthly/quarterly it's the
// day of month (clamped 1–28 so it exists in every month). sendHour is 0–23.
export function nextRunAt(
  frequency: Frequency,
  from: Date = new Date(),
  sendDay?: number | null,
  sendHour?: number | null
): string {
  const hour = clamp(sendHour ?? 8, 0, 23);

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
  return f === "weekly" ? "Every week"
    : f === "biweekly" ? "Every 2 weeks"
    : f === "quarterly" ? "Every quarter"
    : "Every month";
}
