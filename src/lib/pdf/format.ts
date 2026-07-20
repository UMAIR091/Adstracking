// Number/date formatting helpers shared by the PDF components. Pure functions.

export const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
export const pct1 = (n: number) => `${(n * 100).toFixed(1)}%`;

// Compact axis-tick formatting: 950 → "950", 1240 → "1.2k", 3400000 → "3.4M".
export function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  if (abs >= 100 || Number.isInteger(n)) return `${Math.round(n)}`;
  return n.toFixed(1);
}

// "2026-06-01" → "Jun 1, 2026" (falls back to the raw string).
export function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return iso;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

// "2026-06-01" → "Jun 1" for chart axis labels.
export function fmtDateShort(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return iso;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function deltaPct(cur: number, prev: number | null | undefined): number | null {
  if (prev == null || prev === 0) return null;
  const p = ((cur - prev) / prev) * 100;
  return isFinite(p) ? p : null;
}

// Renders a delta as "+23%" / "−8%".
export function deltaLabel(d: number): string {
  const v = Math.abs(d) >= 10 ? Math.abs(d).toFixed(0) : Math.abs(d).toFixed(1);
  return `${d >= 0 ? "+" : "-"}${v}%`;
}

export function pagePathOf(url: string): string {
  try {
    const u = new URL(url);
    return (u.pathname || "/") + (u.search || "");
  } catch {
    return url;
  }
}

// Hard cap on cell text so a single monster query/URL can't wreck a table row.
export function truncate(s: string, max = 68): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
