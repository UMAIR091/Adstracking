// Pure scheduling helpers shared by the schedules API and the delivery cron.

export const FREQUENCIES = ["weekly", "monthly", "quarterly"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export function isFrequency(v: unknown): v is Frequency {
  return typeof v === "string" && (FREQUENCIES as readonly string[]).includes(v);
}

// Next delivery time after `from`, normalized to 08:00 so a daily cron picks it
// up reliably regardless of the exact run time.
export function nextRunAt(frequency: Frequency, from: Date = new Date()): string {
  const d = new Date(from);
  d.setHours(8, 0, 0, 0);
  if (frequency === "weekly") d.setDate(d.getDate() + 7);
  else if (frequency === "quarterly") d.setMonth(d.getMonth() + 3);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

export function frequencyLabel(f: Frequency): string {
  return f === "weekly" ? "Every week" : f === "quarterly" ? "Every quarter" : "Every month";
}
