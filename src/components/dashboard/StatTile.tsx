import Link from "next/link";
import { StatusDot, type StatusTone } from "@/components/ui/status-chip";

export type StatTone = "neutral" | "positive" | "warning" | "danger";

const TONE: Record<StatTone, { dot: StatusTone; text: string }> = {
  neutral: { dot: "muted", text: "text-ink-500" },
  positive: { dot: "success", text: "text-success-700" },
  warning: { dot: "warning", text: "text-warning-700" },
  danger: { dot: "danger", text: "text-danger-700" },
};

export type StatTileData = {
  label: string;
  /** The headline figure, already formatted. */
  value: string;
  /** One short line explaining what the number means or what to do next. */
  hint: string;
  /** Kept for callers that still pass one; the strip shows a status dot instead. */
  icon?: string;
  tone?: StatTone;
  href?: string;
};

/**
 * The Home stat strip: every headline number in one bordered grid with 1px
 * gaps, each cell a link to where it drills down. Every cell carries a hint
 * line with a coloured dot, because a bare number invites "is that good?".
 */
export function StatRow({ stats }: { stats: StatTileData[] }) {
  return (
    <div className="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-ink-200 bg-ink-200 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((s) => {
        const tone = TONE[s.tone ?? "neutral"];
        const body = (
          <>
            <span className="block text-[12.5px] text-ink-400">{s.label}</span>
            <span className="mt-1 block text-[26px] font-semibold leading-tight tracking-[-0.03em] tabular-nums text-ink-900">{s.value}</span>
            <span className={`mt-1 flex items-center gap-1.5 text-[12.5px] ${tone.text}`}>
              <StatusDot tone={tone.dot} />
              {s.hint}
            </span>
          </>
        );
        return s.href ? (
          <Link key={s.label} href={s.href} className="block bg-surface px-[18px] py-4 transition-colors hover:bg-ink-50">
            {body}
          </Link>
        ) : (
          <div key={s.label} className="bg-surface px-[18px] py-4">
            {body}
          </div>
        );
      })}
    </div>
  );
}
