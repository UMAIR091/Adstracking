// The cross-channel overview that heads the "All" view of client Performance.
//
// "All" used to be a concatenation: each metric group's section stacked one
// after another, so answering "how did this client do overall?" meant scrolling
// through every channel and holding the numbers in your head.
//
// The rule this is built around is the same one the rest of Performance
// follows: metrics only combine where the arithmetic is genuinely valid. There
// is no grand total here, because there isn't one — Search Console clicks, GA4
// sessions, ad spend and store revenue count different things. Instead each
// channel family contributes its own headline figure, labelled with where it
// came from, so the row reads as "here is the top line from each channel"
// rather than a fabricated single number.
//
// Pure functions over the same snapshots Performance already holds — no new
// queries, no second data path.
import { aggregatePaidSnapshots } from "@/lib/integrations/blocks";
import type { MetricGroup } from "@/lib/integrations/analyticsViews";

export type OverviewMetric = {
  label: string;
  /** Preformatted for display; null when it cannot legitimately be calculated. */
  value: string | null;
  /** Which channel/source the figure came from — never blank. */
  source: string;
  group: MetricGroup;
};

type Source = {
  id: string;
  name: string;
  group: MetricGroup;
  snapshot: unknown;
};

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function at(obj: unknown, ...path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

const fmtNum = (v: number) => Math.round(v).toLocaleString();
const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$", GBP: "£", EUR: "€", JPY: "¥", AUD: "A$", CAD: "C$", INR: "₹",
};
function fmtMoney(v: number, currency: string | null): string {
  const sym = currency ? (CURRENCY_SYMBOLS[currency.toUpperCase()] ?? `${currency.toUpperCase()} `) : "";
  return `${sym}${Math.round(v).toLocaleString()}`;
}

/** Joins contributing source names for the provenance line. */
const from = (names: string[]) => (names.length === 1 ? names[0] : `${names.length} sources`);

/**
 * Headline figures across every connected channel.
 *
 * Combination rules, in one place:
 *  - Paid media DOES combine across platforms (spend/clicks/conversions are the
 *    same unit everywhere) — but only when every account reports the same
 *    currency, which aggregatePaidSnapshots enforces.
 *  - Search Console, GA4, commerce and email each contribute their own headline
 *    and are never added to anything else.
 */
export function buildOverview(sources: Source[]): OverviewMetric[] {
  const out: OverviewMetric[] = [];
  const inGroup = (g: MetricGroup) => sources.filter((s) => s.group === g);

  // ── Paid media ──
  const paid = inGroup("paid");
  if (paid.length > 0) {
    const agg = aggregatePaidSnapshots(paid.map((s) => ({ type: s.id, snapshot: s.snapshot })));
    if (agg) {
      const names = from(agg.sourceNames);
      // Spend is omitted entirely when currencies disagree rather than summed.
      out.push({
        label: "Ad spend",
        value: agg.currency ? fmtMoney(agg.spend, agg.currency) : null,
        source: agg.currency ? names : "Mixed currencies — not combined",
        group: "paid",
      });
      out.push({ label: "Ad clicks", value: fmtNum(agg.clicks), source: names, group: "paid" });
      out.push({ label: "Conversions", value: fmtNum(agg.conversions), source: names, group: "paid" });
    } else {
      // A single paid source: read its own totals directly.
      const s = paid[0];
      const spend = num(at(s.snapshot, "totals", "spend"));
      const currency = (at(s.snapshot, "currency") as string | null) ?? null;
      out.push({ label: "Ad spend", value: fmtMoney(spend, currency), source: s.name, group: "paid" });
      out.push({ label: "Ad clicks", value: fmtNum(num(at(s.snapshot, "totals", "clicks"))), source: s.name, group: "paid" });
      out.push({
        label: "Conversions",
        value: fmtNum(num(at(s.snapshot, "totals", "conversions"))),
        source: s.name,
        group: "paid",
      });
    }
  }

  // ── Organic search (Search Console only; SEO tools report estimates) ──
  const gsc = sources.find((s) => s.id === "gsc");
  if (gsc) {
    const clicks = num(at(gsc.snapshot, "totals", "clicks"));
    const impressions = num(at(gsc.snapshot, "totals", "impressions"));
    out.push({ label: "Organic clicks", value: fmtNum(clicks), source: gsc.name, group: "seo" });
    out.push({
      label: "Organic CTR",
      // A CTR needs impressions to be a rate at all.
      value: impressions > 0 ? fmtPct(num(at(gsc.snapshot, "totals", "ctr"))) : null,
      source: gsc.name,
      group: "seo",
    });
  }

  // ── Website analytics ──
  const ga4 = sources.find((s) => s.id === "ga4");
  if (ga4) {
    out.push({ label: "Sessions", value: fmtNum(num(at(ga4.snapshot, "totals", "sessions"))), source: ga4.name, group: "analytics" });
  }

  // ── E-commerce ──
  const commerce = inGroup("commerce");
  if (commerce.length > 0) {
    const currencies = commerce.map((s) => ((at(s.snapshot, "currency") as string | null) ?? "").toUpperCase());
    const oneCurrency = currencies.every(Boolean) && new Set(currencies).size === 1 ? currencies[0] : null;
    const revenue = commerce.reduce((acc, s) => acc + num(at(s.snapshot, "totals", "revenue")), 0);
    const orders = commerce.reduce((acc, s) => acc + num(at(s.snapshot, "totals", "orders")), 0);
    const names = from(commerce.map((s) => s.name));
    out.push({
      label: "Store revenue",
      value: oneCurrency ? fmtMoney(revenue, oneCurrency) : null,
      source: oneCurrency ? names : "Mixed currencies — not combined",
      group: "commerce",
    });
    out.push({ label: "Orders", value: fmtNum(orders), source: names, group: "commerce" });
  }

  // ── Email ──
  const email = inGroup("email");
  if (email.length > 0) {
    const sent = email.reduce((acc, s) => acc + num(at(s.snapshot, "totals", "emailsSent")), 0);
    const opens = email.reduce((acc, s) => acc + num(at(s.snapshot, "totals", "opens")), 0);
    const names = from(email.map((s) => s.name));
    out.push({ label: "Emails sent", value: fmtNum(sent), source: names, group: "email" });
    out.push({
      label: "Open rate",
      // Recomputed from the summed components, never averaged across lists.
      value: sent > 0 ? fmtPct(opens / sent) : null,
      source: names,
      group: "email",
    });
  }

  return out;
}
