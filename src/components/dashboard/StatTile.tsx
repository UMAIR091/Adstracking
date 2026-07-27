import Link from "next/link";
import {
  Users, FileBarChart2, CalendarClock, RefreshCw, Cable, ArrowRight, AlertCircle, CheckCircle2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

// Icon names, not components — a Server Component can't pass a function to a
// Client Component, and keeping the same convention everywhere avoids the trap.
const ICONS: Record<string, LucideIcon> = {
  users: Users,
  report: FileBarChart2,
  calendar: CalendarClock,
  sync: RefreshCw,
  cable: Cable,
  alert: AlertCircle,
  check: CheckCircle2,
};

export type StatTone = "neutral" | "positive" | "warning" | "danger";

const TONES: Record<StatTone, string> = {
  neutral: "bg-brand-50 text-brand-600",
  positive: "bg-emerald-50 text-emerald-600",
  warning: "bg-amber-50 text-amber-600",
  danger: "bg-rose-50 text-rose-600",
};

export type StatTileData = {
  label: string;
  /** The headline figure, already formatted. */
  value: string;
  /** One short line explaining what the number means or what to do next. */
  hint: string;
  icon: string;
  tone?: StatTone;
  href?: string;
};

/**
 * One headline workspace stat.
 *
 * Every tile carries a hint line: a bare number invites the question "is that
 * good?", and answering it inline is cheaper than making the user navigate to
 * find out. Tiles are links wherever a drill-down exists.
 */
export function StatTile({ label, value, hint, icon, tone = "neutral", href }: StatTileData) {
  const Icon = ICONS[icon] ?? Users;

  const inner = (
    <Card className={`h-full ${href ? "transition-all hover:-translate-y-0.5 hover:shadow-md" : ""}`}>
      <CardContent className="flex h-full flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${TONES[tone]}`}>
            <Icon size={17} aria-hidden />
          </span>
          {href && <ArrowRight size={15} className="mt-1 text-ink-300" aria-hidden />}
        </div>
        <p className="mt-3 text-2xl font-semibold leading-none tracking-tight text-ink-900">{value}</p>
        <p className="mt-1.5 text-sm font-medium text-ink-700">{label}</p>
        <p className="mt-1 text-xs leading-relaxed text-ink-500">{hint}</p>
      </CardContent>
    </Card>
  );

  return href ? (
    <Link href={href} className="block h-full">
      {inner}
    </Link>
  ) : (
    inner
  );
}

/** The headline row. Responsive: 2 up on mobile, 3 on tablet, 5 on desktop. */
export function StatRow({ stats }: { stats: StatTileData[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
      {stats.map((s) => (
        <StatTile key={s.label} {...s} />
      ))}
    </div>
  );
}
