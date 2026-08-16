import {
  TrendingUp, TrendingDown, Target, FileText, Zap, ArrowDownRight, ShoppingCart, Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SIGNAL_META, type Signal, type Confidence } from "@/lib/insights/signals";
import { HelpHint } from "@/components/ui/help-hint";

// Icon names, never components, crossing any server→client boundary.
const ICONS: Record<string, LucideIcon> = {
  spike: Zap,
  drop: ArrowDownRight,
  "trend-up": TrendingUp,
  "trend-down": TrendingDown,
  page: FileText,
  target: Target,
  conversion: ShoppingCart,
};

// Tone drives the whole card, so a decline can never be mistaken for a win at a
// glance. Kept to tinted surfaces rather than saturated fills: a dashboard of
// loud red cards reads as alarm, which is the opposite of trustworthy.
const TONES = {
  positive: { chip: "bg-emerald-50 text-emerald-600 ring-emerald-100", accent: "text-emerald-700", bar: "bg-emerald-400" },
  negative: { chip: "bg-rose-50 text-rose-600 ring-rose-100", accent: "text-rose-700", bar: "bg-rose-400" },
  opportunity: { chip: "bg-amber-50 text-amber-600 ring-amber-100", accent: "text-amber-700", bar: "bg-amber-400" },
  neutral: { chip: "bg-brand-50 text-brand-600 ring-brand-100", accent: "text-brand-700", bar: "bg-brand-400" },
} as const;

// Three dots, filled to the confidence level. A number here would imply a
// precision the underlying statistics don't have; the tooltip carries the
// actual reasoning, which is what makes the indicator trustworthy rather than
// decorative.
const CONFIDENCE_DOTS: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };
const CONFIDENCE_LABEL: Record<Confidence, string> = { high: "High confidence", medium: "Medium confidence", low: "Low confidence" };

function ConfidenceMeter({ level, reason }: { level: Confidence; reason: string }) {
  const filled = CONFIDENCE_DOTS[level];
  const color = level === "high" ? "bg-emerald-500" : level === "medium" ? "bg-amber-500" : "bg-ink-300";

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="flex items-center gap-0.5" role="img" aria-label={CONFIDENCE_LABEL[level]}>
        {[0, 1, 2].map((i) => (
          <span key={i} className={`h-1.5 w-1.5 rounded-full ${i < filled ? color : "bg-ink-200"}`} aria-hidden />
        ))}
      </span>
      <span className="text-[11px] font-medium text-ink-500">{CONFIDENCE_LABEL[level]}</span>
      <HelpHint label="Why this confidence level">{reason}</HelpHint>
    </span>
  );
}

/**
 * A single derived insight.
 *
 * Deliberately shows its working: the headline number, the sentence that
 * explains it in real figures, where it came from, and how much to trust it.
 * Users believe an analysis they can check.
 */
export function InsightCard({ signal }: { signal: Signal }) {
  const meta = SIGNAL_META[signal.kind];
  const tone = TONES[meta.tone];
  const Icon = ICONS[meta.icon] ?? Sparkles;

  return (
    <article className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-ink-100 bg-surface p-4 shadow-xs transition-shadow hover:shadow-md">
      {/* Tone accent — a quiet left edge rather than a coloured card. */}
      <span className={`absolute inset-y-0 left-0 w-0.5 ${tone.bar}`} aria-hidden />

      <div className="flex items-start justify-between gap-3">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${tone.chip}`}>
          <Icon size={15} aria-hidden />
        </span>
        <span className={`text-lg font-semibold tabular-nums leading-none ${tone.accent}`}>{signal.metric}</span>
      </div>

      <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
        {meta.label}
        {signal.context && <span className="ml-1.5 normal-case tracking-normal text-ink-500">· {signal.context}</span>}
      </p>
      <p className="mt-0.5 truncate text-sm font-semibold text-ink-900" title={signal.title}>
        {signal.title}
      </p>
      <p className="mt-1.5 flex-1 text-xs leading-relaxed text-ink-600">{signal.detail}</p>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 pt-2.5">
        <ConfidenceMeter level={signal.confidence} reason={signal.confidenceReason} />
        <span className="text-[11px] text-ink-400">{signal.source}</span>
      </div>
    </article>
  );
}

/**
 * Responsive grid of insight cards.
 *
 * Capped by the caller rather than scrolling: six well-chosen cards inform, a
 * wall of twenty is the "overwhelming" failure this is meant to avoid.
 */
export function InsightGrid({ signals }: { signals: Signal[] }) {
  if (signals.length === 0) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {signals.map((s, i) => (
        <InsightCard key={`${s.kind}-${i}`} signal={s} />
      ))}
    </div>
  );
}
