// The "So What?" layer: what the numbers MEAN, and what to do next.
//
// A client report full of figures still leaves the reader asking "and?". This
// turns measured signals into an interpretation and a next step — without
// inventing anything.
//
// The honesty rule, and how it is enforced structurally:
//   · Every FIGURE comes from `detectSignals` / the report blocks, which
//     compute over the client's own rows. Nothing here calculates a metric.
//   · Every INTERPRETATION is a fixed editorial line keyed to the KIND of
//     pattern that was measured — not generated prose. "Clicks fell 32%" is
//     the measurement; "demand or visibility changed, worth diagnosing before
//     it compounds" is the standing meaning of a traffic drop. The mapping is
//     the same for every client, so it can never become a claim about this
//     client that the data doesn't support.
//   · Every action carries the measurement that motivated it, so a reader can
//     always trace a recommendation back to a number in the report.
//
// Priority is derived from the signal's own confidence and weight, never from
// its position in a list.
import type { Signal, Confidence } from "@/lib/insights/signals";
import type { ReportBlock } from "@/lib/integrations/blocks";
import { formatBlockValue } from "@/lib/integrations/blocks";

export type Priority = "High" | "Medium" | "Low";

export type SoWhat = {
  /** The measured fact, as reported by the signal. */
  observation: string;
  /** What that kind of movement means. Fixed per pattern, never generated. */
  meaning: string;
  /** The headline figure and where it came from. */
  metric: string;
  source: string;
  confidence: Confidence;
  confidenceReason: string;
};

export type RecommendedAction = {
  action: string;
  /** The measurement behind it — always a real figure from the report. */
  because: string;
  priority: Priority;
  source: string;
};

// What each measured pattern means. Deliberately general: these describe the
// pattern, not the client, so they stay true whatever the numbers are.
const MEANING: Record<Signal["kind"], string> = {
  winning_keyword:
    "Demand is converting into visibility here. Terms already moving up respond best to further investment, because the page behind them has proven it can rank.",
  declining_keyword:
    "Lost ground on a term that was working. Declines usually compound as competitors consolidate the position, so this is cheaper to address now than later.",
  winning_page:
    "One page is carrying a disproportionate share of growth. That makes it both an asset to protect and a template for what works on this site.",
  opportunity:
    "Impressions without the matching clicks means the audience is finding the listing but not choosing it — a presentation problem rather than a visibility one.",
  traffic_spike:
    "A step change rather than normal variation. Worth identifying the cause so it can be repeated deliberately instead of hoped for.",
  traffic_drop:
    "A fall outside normal variation. Something changed in demand, visibility or tracking, and confirming which one is the first step.",
  conversion_opportunity:
    "Traffic is arriving but not completing. The cost of fixing conversion is usually far lower than the cost of buying more visits.",
};

// The next step each pattern calls for.
const ACTION: Record<Signal["kind"], string> = {
  winning_keyword: "Expand the content behind this term and add internal links to it while it has momentum.",
  declining_keyword: "Review what changed on this page and in the results for this term, then refresh it.",
  winning_page: "Apply what works on this page to comparable pages, and protect it from unrelated changes.",
  opportunity: "Rewrite the title and meta description for this listing to earn more of the impressions it already has.",
  traffic_spike: "Identify the source of the increase and decide whether it can be repeated.",
  traffic_drop: "Check tracking first, then rankings and seasonality, to confirm the cause before reacting.",
  conversion_opportunity: "Review the conversion path for the highest-traffic landing pages.",
};

/** High confidence and heavy weight are what make something urgent. */
function priorityOf(sig: Signal): Priority {
  if (sig.confidence === "high" && sig.weight >= 60) return "High";
  if (sig.confidence === "low") return "Low";
  return sig.confidence === "high" || sig.weight >= 40 ? "Medium" : "Low";
}

const RANK: Record<Priority, number> = { High: 0, Medium: 1, Low: 2 };

/**
 * The interpretation layer. One entry per measured signal, strongest first,
 * capped so the opening page stays readable in about a minute.
 */
export function buildSoWhat(signals: Signal[], limit = 3): SoWhat[] {
  return signals.slice(0, limit).map((sig) => ({
    observation: sig.detail,
    meaning: MEANING[sig.kind],
    metric: sig.metric,
    source: sig.source,
    confidence: sig.confidence,
    confidenceReason: sig.confidenceReason,
  }));
}

/**
 * Evidence-backed next steps. Each is tied to the signal that motivated it, so
 * "why are you telling me this?" is answerable from the report itself.
 *
 * De-duplicated by action text: three winning keywords produce one "expand the
 * content" step, not three near-identical ones.
 */
export function buildActions(signals: Signal[], limit = 4): RecommendedAction[] {
  const seen = new Set<string>();
  const out: RecommendedAction[] = [];

  for (const sig of signals) {
    const action = ACTION[sig.kind];
    if (!action || seen.has(action)) continue;
    seen.add(action);
    out.push({ action, because: sig.detail, priority: priorityOf(sig), source: sig.source });
  }

  return out.sort((a, b) => RANK[a.priority] - RANK[b.priority]).slice(0, limit);
}

/**
 * Measured checks over non-Google channels, where `detectSignals` doesn't
 * reach. Each is a plain arithmetic fact about the block's own KPIs — spend
 * with nothing to show for it, or clicks that never convert — not a model's
 * opinion. Returns nothing when the components aren't present, so a channel
 * without conversion tracking is never accused of failing to convert.
 */
export function blockActions(blocks: ReportBlock[]): RecommendedAction[] {
  const out: RecommendedAction[] = [];

  for (const b of blocks) {
    if (b.category !== "paid") continue;
    const kpi = (label: string) => b.kpis.find((k) => k.label.toLowerCase() === label.toLowerCase());
    const spend = kpi("Spend");
    const conversions = kpi("Conversions");
    const clicks = kpi("Clicks");

    // Spend recorded, conversions tracked as a metric, and none of them landed.
    if (spend?.value != null && spend.value > 0 && conversions?.value === 0) {
      out.push({
        action: `Confirm conversion tracking is firing for ${b.sourceName}, then review targeting and landing pages.`,
        because: `${b.sourceName} recorded ${formatBlockValue(spend.value, "currency", b.currency)} of spend and no conversions in this period.`,
        priority: "High",
        source: b.sourceName,
      });
      continue;
    }

    // Money spent, and not a single click to show for it.
    if (spend?.value != null && spend.value > 0 && clicks?.value === 0) {
      out.push({
        action: `Review creative and targeting for ${b.sourceName} — the ads are being served but not clicked.`,
        because: `${b.sourceName} recorded ${formatBlockValue(spend.value, "currency", b.currency)} of spend and no clicks in this period.`,
        priority: "High",
        source: b.sourceName,
      });
    }
  }

  return out;
}

/** Merges signal-derived and channel-derived actions, strongest first. */
export function allActions(signals: Signal[], blocks: ReportBlock[], limit = 4): RecommendedAction[] {
  return [...blockActions(blocks), ...buildActions(signals, limit)]
    .sort((a, b) => RANK[a.priority] - RANK[b.priority])
    .slice(0, limit);
}
