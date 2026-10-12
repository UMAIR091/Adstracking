// Post-generation check of AI insights against the data they were written from.
//
// The prompt forbids inventing figures, but a rule in a prompt is a request,
// not a guarantee. This is the guarantee: every number in every sentence the
// model returns must be one that was printed in its prompt — the client's own
// data — or a natural rounding of one. A sentence carrying a figure that isn't
// there is removed before anything is stored or shown, and the removal is
// recorded on the insights. If the one-sentence summary fails, it is dropped
// and the report falls back to its deterministic summary, which is built only
// from measured figures (lib/reports/summary.ts).
//
// Also removed: a sentence asserting causation outright ("caused", "resulted
// in"), which the prompt bans because the data cannot show it.
//
// Deliberately conservative. It cannot judge whether a true figure is used
// for the right claim — only that the figure exists in the data — so it is a
// floor under the prose, not proof that the prose is right.
import type { InsightsVerification, ReportInsights } from "./types";

type NumberToken = { text: string; value: number; tolerance: number; isPercent: boolean; isSmallCount: boolean };

const MONTH = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

// Calendar references are not metrics: removed before numbers are read so a
// date or a quarter never counts as an unsupported figure.
const CALENDAR: RegExp[] = [
  /\b\d{4}-\d{2}-\d{2}\b/g,
  new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH}\\b\\.?(?:,?\\s+(?:19|20)\\d{2})?`, "gi"),
  new RegExp(`\\b${MONTH}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?\\b(?:,?\\s+(?:19|20)\\d{2})?`, "gi"),
  new RegExp(`\\b(?:Q[1-4]|H[12]|${MONTH})\\.?\\s+(?:19|20)\\d{2}\\b`, "gi"),
  /\b(?:in|of|since|during|for|from|to|until)\s+(?:19|20)\d{2}\b/gi,
  /\bQ[1-4]\b/g,
];

// An optional currency mark, the number, then an optional unit.
const NUMBER =
  /(?<![\w.])(?:[£$€₹¥]|Rs\.?\s?|PKR\s?|USD\s?|INR\s?|GBP\s?|EUR\s?|AUD\s?|CAD\s?)?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(\s?(?:%|percentage points?|pts?\b|per ?cent\b|k\b|K\b|m\b|M\b|million\b|thousand\b|bn\b|billion\b))?/g;

function multiplierOf(unit: string): number {
  const u = unit.trim().toLowerCase();
  if (u === "k" || u === "thousand") return 1e3;
  if (u === "m" || u === "million") return 1e6;
  if (u === "bn" || u === "billion") return 1e9;
  return 1;
}

export function numbersIn(text: string): NumberToken[] {
  let clean = text;
  for (const re of CALENDAR) clean = clean.replace(re, " ");
  const out: NumberToken[] = [];
  for (const m of Array.from(clean.matchAll(NUMBER))) {
    const intPart = m[1].replace(/,/g, "");
    const frac = m[2] ?? "";
    const unit = (m[3] ?? "").trim();
    const mult = multiplierOf(unit);
    const isPercent = /%|percent|per cent|point|pts?/i.test(unit);
    const value = Number(intPart + frac) * mult;
    if (!Number.isFinite(value)) continue;

    // The precision the writer used, as the half-width of the rounding it
    // implies. "18%" may stand for anything from 17.5% to 18.5%; "4.2k" for
    // 4,150–4,250. A whole count of 1,000 or more written with trailing zeros
    // ("5,000") may be rounded to two significant figures, never coarser.
    const decimals = frac ? frac.length - 1 : 0;
    let unitSize = Math.pow(10, -decimals) * mult;
    if (!frac && mult === 1 && !isPercent && value >= 1000) {
      const digits = intPart.length;
      const trailing = intPart.length - intPart.replace(/0+$/, "").length;
      unitSize = Math.pow(10, Math.min(trailing, Math.max(0, digits - 2)));
    }
    out.push({
      text: m[0].trim(),
      value,
      tolerance: unitSize / 2 + 1e-9,
      isPercent,
      // "3 campaigns", "page 1", "top 5": a small whole count that names how
      // many of something the data lists, not a measured figure.
      isSmallCount: !frac && mult === 1 && !isPercent && value <= 10,
    });
  }
  return out;
}

/** Figures in `text` that match nothing in `allowed`, within rounding. */
export function unsupportedNumbers(text: string, allowed: number[]): string[] {
  return numbersIn(text)
    .filter((t) => !t.isSmallCount)
    .filter((t) => !allowed.some((a) => Math.abs(Math.abs(a) - t.value) <= t.tolerance))
    .map((t) => t.text);
}

const CAUSAL = /\b(caused|causing|resulted in|as a result of)\b/i;

/**
 * Removes every insight sentence that is not supported by `promptText`.
 * Returns the cleaned insights with a record of what was removed.
 */
export function verifyInsights(insights: ReportInsights, promptText: string): ReportInsights {
  const allowed = numbersIn(promptText).map((t) => t.value);
  const unsupported: string[] = [];
  let removedClaims = 0;

  const ok = (sentence: string): boolean => {
    const bad = unsupportedNumbers(sentence, allowed);
    const causal = CAUSAL.test(sentence);
    if (bad.length || causal) {
      unsupported.push(...bad, ...(causal ? ["(causal claim)"] : []));
      removedClaims += 1;
      return false;
    }
    return true;
  };
  const keep = (list: string[]) => list.filter(ok);

  const summaryOk = ok(insights.executiveSummary);
  const verification: InsightsVerification = {
    removedClaims: 0,
    summaryRemoved: !summaryOk,
    unsupported: [],
  };
  const cleaned: ReportInsights = {
    executiveSummary: summaryOk ? insights.executiveSummary : "",
    keyWins: keep(insights.keyWins),
    issuesDetected: keep(insights.issuesDetected),
    growthOpportunities: keep(insights.growthOpportunities),
    recommendedActions: keep(insights.recommendedActions),
  };
  verification.removedClaims = removedClaims;
  verification.unsupported = Array.from(new Set(unsupported)).slice(0, 20);
  return { ...cleaned, verification };
}
