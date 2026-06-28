// Pure scheduling helpers shared by the schedules API and the delivery cron.

export const FREQUENCIES = ["weekly", "monthly", "quarterly"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export function isFrequency(v: unknown): v is Frequency {
  return typeof v === "string" && (FREQUENCIES as readonly string[]).includes(v);
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

  if (frequency === "weekly") {
    const targetDow = clamp(sendDay ?? 1, 0, 6);
    const d = new Date(from);
    d.setUTCHours(hour, 0, 0, 0);
    let diff = (targetDow - d.getUTCDay() + 7) % 7;
    if (diff === 0 && d <= from) diff = 7;
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
  return f === "weekly" ? "Every week" : f === "quarterly" ? "Every quarter" : "Every month";
}
