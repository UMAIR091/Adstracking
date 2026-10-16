// The one definition of period-over-period percentage change.
//
// The report page, the PDF, the verdict, the deterministic summary, the AI
// prompt and the block projector each carried their own copy, and they had
// drifted: two divided by the previous value, four by its absolute value.
// They agreed only because ad metrics are never negative.
//
// Returns null (never 0, never Infinity) whenever there is no honest
// percentage: a value is missing or not finite, or the previous value is
// exactly zero (growth from zero has no percentage). Divides by |previous| so a
// rise reads as positive even from a negative baseline.
export function pctChange(cur: number | null | undefined, prev: number | null | undefined): number | null {
  if (cur == null || prev == null || !Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0) return null;
  const d = ((cur - prev) / Math.abs(prev)) * 100;
  return Number.isFinite(d) ? d : null;
}
