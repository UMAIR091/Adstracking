// The verdict — the first thing a client reads, and usually the only thing.
//
// Everything else in this report answers "what happened". This answers the
// three questions a person actually opens a report to settle, standing in a
// queue, on a phone, in about thirty seconds:
//
//   1. Is this working?        — the headline, in words, not a metric.
//   2. Am I on track?          — this period against the last one.
//   3. Do I need to do anything? — one action, or none.
//
// The rule that shapes every line here: simple is not less data, it is less
// work for the reader. Nothing is removed from the report to make this fit —
// the full figures stay in the sections below. What this does is move the
// interpretation off the client and into the document. "ROAS 4.4x" asks the
// reader to know what ROAS is and whether 4.4 is good. "You got £4.40 back for
// every £1 you spent, up from £3.80" asks nothing of them at all.
//
// The honesty rules from summary.ts hold without exception:
//   - every figure is read from the snapshot; nothing is modelled or inferred
//   - a null KPI means "not calculable" and is skipped, never read as zero
//   - a comparison is only ever claimed when a previous value genuinely exists
//   - currencies are never mixed silently
//   - when there isn't enough to judge, it says so rather than implying success
import type { GscReportFull, Ga4ReportFull } from "@/lib/google";
import type { ReportBlock, BlockKpi } from "@/lib/integrations/blocks";
import { formatBlockValue } from "@/lib/integrations/blocks";

export type VerdictTone = "good" | "mixed" | "attention" | "neutral";

export type Verdict = {
  tone: VerdictTone;
  /** "September went well." — the answer to "is this working?" */
  headline: string;
  /**
   * The body, already in plain language, most important sentence first.
   * Rendered as separate lines so the money sentence can carry visual weight.
   */
  lines: string[];
  /** "Up from £3.80 last period." — omitted entirely when nothing to compare. */
  comparison: string | null;
  /** True when `comparison` describes an improvement. Drives the tick or flag. */
  comparisonGood: boolean | null;
  /** The single next step, if the evidence supports one. */
  action: string | null;
};

export type VerdictInput = {
  /** The reporting window. The headline noun is derived from it. */
  period: { start: string; end: string };
  gsc: GscReportFull | null;
  ga4: Ga4ReportFull | null;
  blocks: ReportBlock[];
  /** The already-prioritised action from the interpretation layer. */
  watch?: { action: string; because: string } | null;
};

// ── reading figures out of the snapshot ─────────────────────────────────────

/** Labels that mean "money we put in", lowercased, across every ad platform. */
const SPEND_LABELS = ["spend", "cost", "ad spend", "amount spent"];

/** Labels that mean "money that came back". */
const REVENUE_LABELS = ["revenue", "conversion value", "purchase value", "sales", "total revenue"];

/** Labels that mean "a person who did the thing we wanted". */
const OUTCOME_LABELS = ["conversions", "orders", "leads", "purchases", "contacts", "deals", "calls", "subscribers"];

const isUsable = (k: BlockKpi): boolean => k.value !== null && Number.isFinite(k.value);

/**
 * Sums one kind of metric across every channel that reports it.
 *
 * Returns null rather than 0 when nothing measured it — the difference between
 * "no channel tracks revenue" and "revenue was zero" matters, and conflating
 * them is how a report ends up claiming a business made nothing.
 *
 * Blocks carrying a different currency from the first monetary block are
 * skipped and reported back, so the caller can decline to state a total it
 * cannot honestly add up.
 */
function sumAcross(
  blocks: ReportBlock[],
  labels: string[],
  opts: { monetary: boolean },
): { total: number | null; previous: number | null; currency: string | null; mixedCurrency: boolean } {
  let total: number | null = null;
  let previous: number | null = null;
  let currency: string | null = null;
  let mixedCurrency = false;

  for (const b of blocks) {
    for (const k of b.kpis) {
      if (!labels.includes(k.label.toLowerCase())) continue;
      if (!isUsable(k)) continue;

      if (opts.monetary) {
        // First monetary block sets the currency for the whole total. Anything
        // in a different one cannot be added to it, so it is left out and
        // flagged instead of being silently summed into a wrong number.
        if (currency === null) currency = b.currency;
        else if (b.currency !== null && b.currency !== currency) {
          mixedCurrency = true;
          continue;
        }
      }

      total = (total ?? 0) + (k.value as number);
      if (k.previous != null && Number.isFinite(k.previous)) {
        previous = (previous ?? 0) + k.previous;
      }
    }
  }

  return { total, previous, currency, mixedCurrency };
}

const money = (v: number, currency: string | null) => formatBlockValue(v, "currency", currency);
const count = (v: number) => Math.round(v).toLocaleString("en-US");

/**
 * "£4.40" from spend and revenue.
 *
 * Deliberately expressed per single unit of currency rather than as a
 * multiple: "4.4x" is a ratio the reader has to decode, "£4.40 back for every
 * £1" is a sentence they already understand.
 */
function perUnitReturn(revenue: number, spend: number, currency: string | null): string | null {
  if (spend <= 0) return null;
  const ratio = revenue / spend;
  if (!Number.isFinite(ratio)) return null;
  return formatBlockValue(ratio, "currency", currency);
}

function pctChange(cur: number, prev: number | null): number | null {
  if (prev == null || prev === 0 || !Number.isFinite(prev)) return null;
  const d = ((cur - prev) / Math.abs(prev)) * 100;
  return Number.isFinite(d) ? d : null;
}

/** "12%" — one decimal only when the number is small enough to need it. */
const fmtPct = (d: number) => `${Math.abs(d) >= 10 ? Math.abs(d).toFixed(0) : Math.abs(d).toFixed(1)}%`;

// ── the headline noun ───────────────────────────────────────────────────────

const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * "September" when the window is exactly one calendar month, "This period"
 * otherwise.
 *
 * The headline reads as a sentence — "September went well." — so it needs a
 * noun a person would say aloud, not "1 Sep – 30 Sep". Anything that isn't a
 * clean month falls back rather than rounding to the nearest one: calling a
 * window running 12 Aug – 9 Sep "September" is a small lie, and this layer
 * doesn't tell those.
 *
 * Derived here rather than passed in so both the web and PDF renderers get the
 * same noun without either having to know the rule.
 */
export function periodHeadlineLabel(start: string | null | undefined, end: string | null | undefined): string {
  const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(start ?? "");
  const b = /^(\d{4})-(\d{2})-(\d{2})/.exec(end ?? "");
  if (!a || !b) return "This period";

  const [ay, am, ad] = [+a[1], +a[2] - 1, +a[3]];
  const [by, bm, bd] = [+b[1], +b[2] - 1, +b[3]];
  if (ay !== by || am !== bm || ad !== 1 || am < 0 || am > 11) return "This period";

  const lastDay = new Date(Date.UTC(by, bm + 1, 0)).getUTCDate();
  return bd === lastDay ? MONTHS_LONG[bm] : "This period";
}

// ── the verdict ─────────────────────────────────────────────────────────────

/**
 * How the headline is chosen.
 *
 * A verdict is only stated when there is a previous period to judge against —
 * without one there is no basis for calling a month good or bad, and inventing
 * a cheerful adjective would be exactly the dishonesty this layer exists to
 * prevent. With no baseline the headline simply reports, and the tone is
 * neutral so the panel renders without a colour claim.
 */
function headlineFor(periodLabel: string, delta: number | null, good: boolean): { headline: string; tone: VerdictTone } {
  if (delta == null || Math.abs(delta) < 3) {
    return delta == null
      ? { headline: `${periodLabel} at a glance.`, tone: "neutral" }
      : { headline: `${periodLabel} held steady.`, tone: "mixed" };
  }
  if (good) return { headline: `${periodLabel} went well.`, tone: "good" };
  return { headline: `${periodLabel} needs attention.`, tone: "attention" };
}

/**
 * Builds the verdict from whatever the report actually measured.
 *
 * The ladder runs money → outcomes → traffic, stopping at the first rung with
 * real figures behind it, because that is the order a business owner cares
 * about. A shop that tracks revenue should never be led with sessions.
 */
export function buildVerdict(input: VerdictInput): Verdict | null {
  const { period, gsc, ga4, blocks, watch } = input;
  const periodLabel = periodHeadlineLabel(period?.start, period?.end);

  const spend = sumAcross(blocks, SPEND_LABELS, { monetary: true });
  const revBlocks = sumAcross(blocks, REVENUE_LABELS, { monetary: true });

  // Analytics revenue counts too, but only when no channel reported its own —
  // adding GA4's tracked revenue to platform-reported revenue would double
  // count the same orders.
  const ga4Revenue = ga4 && ga4.totals.totalRevenue > 0 ? ga4.totals.totalRevenue : null;
  const revenueTotal = revBlocks.total ?? ga4Revenue;
  const revenuePrev = revBlocks.total != null ? revBlocks.previous : (ga4?.previousTotals?.totalRevenue ?? null);
  const currency = revBlocks.currency ?? spend.currency;

  const lines: string[] = [];
  let comparison: string | null = null;
  let comparisonGood: boolean | null = null;
  let delta: number | null = null;
  let good = true;

  // ── rung 1: money in, money out ───────────────────────────────────────────
  //
  // A foreign-currency channel does not suppress the verdict: sumAcross has
  // already left those amounts out, so the total below is a true figure for
  // the currency it names. Staying silent would be the worse trade — the
  // client loses the headline entirely over one channel. The note added later
  // tells them which figures sit outside it.
  if (spend.total != null && spend.total > 0 && revenueTotal != null) {
    const back = perUnitReturn(revenueTotal, spend.total, currency);
    const one = formatBlockValue(1, "currency", currency);

    lines.push(
      `You spent ${money(spend.total, currency)} and it brought in ${money(revenueTotal, currency)}` +
        (back ? ` — about ${back} back for every ${one}.` : "."),
    );

    // The comparison is on return, not on revenue: revenue rising because
    // spend rose is not the same as the money working harder, and the client
    // is entitled to know which one happened.
    if (spend.previous != null && spend.previous > 0 && revenuePrev != null) {
      const prevBack = revenuePrev / spend.previous;
      const curBack = revenueTotal / spend.total;
      delta = pctChange(curBack, prevBack);
      good = delta != null && delta >= 0;
      if (delta != null && Math.abs(delta) >= 1) {
        comparison = `${good ? "Up" : "Down"} from ${money(prevBack, currency)} back per ${one} last period.`;
        comparisonGood = good;
      }
    }
  }

  // ── rung 2: outcomes ──────────────────────────────────────────────────────
  if (lines.length === 0) {
    const outcomes = sumAcross(blocks, OUTCOME_LABELS, { monetary: false });
    const ga4Conv = ga4 && ga4.totals.conversions > 0 ? ga4.totals.conversions : null;
    const total = outcomes.total ?? ga4Conv;
    const prev = outcomes.total != null ? outcomes.previous : (ga4?.previousTotals?.conversions ?? null);

    if (total != null) {
      const noun = total === 1 ? "result" : "results";
      lines.push(`Your marketing produced ${count(total)} ${noun} this period.`);

      if (spend.total != null && spend.total > 0 && total > 0 && !spend.mixedCurrency) {
        lines.push(`That worked out at about ${money(spend.total / total, currency)} each.`);
      }

      delta = pctChange(total, prev);
      good = delta != null && delta >= 0;
      if (delta != null && Math.abs(delta) >= 1 && prev != null) {
        const diff = Math.abs(total - prev);
        comparison = `${good ? "Up" : "Down"} ${fmtPct(delta)} on last period — ${count(diff)} ${good ? "more" : "fewer"} than before.`;
        comparisonGood = good;
      }
    }
  }

  // ── rung 3: people reaching you ───────────────────────────────────────────
  if (lines.length === 0) {
    const sessions = ga4?.totals.sessions ?? null;
    const clicks = gsc?.totals.clicks ?? null;

    if (sessions != null && sessions > 0) {
      lines.push(`${count(sessions)} people visited your website this period.`);
      delta = pctChange(sessions, ga4?.previousTotals?.sessions ?? null);
    } else if (clicks != null && clicks > 0) {
      lines.push(`${count(clicks)} people found you through Google search this period.`);
      delta = pctChange(clicks, gsc?.previousTotals?.clicks ?? null);
    }

    good = delta != null && delta >= 0;
    if (delta != null && Math.abs(delta) >= 1) {
      comparison = `${good ? "Up" : "Down"} ${fmtPct(delta)} on last period.`;
      comparisonGood = good;
    }
  }

  // Nothing measurable. Saying so plainly is the honest output; a cheerful
  // headline over an empty report is the failure mode this guards against.
  if (lines.length === 0) return null;

  // A total we could not add up honestly is worth admitting, because the
  // client may be looking at a channel whose figures are missing from it.
  if (spend.mixedCurrency || revBlocks.mixedCurrency) {
    lines.push("Some channels report in a different currency and are shown separately below.");
  }

  const { headline, tone } = headlineFor(periodLabel, delta, good);

  return {
    tone,
    headline,
    lines,
    comparison,
    comparisonGood,
    action: watch?.action ?? null,
  };
}
