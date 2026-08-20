import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import {
  Activity, AlertTriangle, ArrowRight, CalendarCheck, CalendarClock, FileBarChart2, Mail, MailX, RefreshCw,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ACTIVITY_META, type ActivityEvent, type ActivityTone } from "@/lib/dashboard/activity";
import type { OverviewMetric } from "@/lib/integrations/overview";
import { SOURCE_HEALTH, type SourceHealth } from "@/lib/integrations/status";

// The three panels of a client's Overview.
//
// Overview answers four questions and stops: how is the client doing, is
// anything broken, how fresh is the data, and what happened last. Everything
// below the fold used to be either a number the Performance tab shows better or
// a link the tab bar already provides, so it isn't here any more.
//
// Every value is passed in already derived — these are presentation only. The
// figures come from buildOverview (the same function the Performance tab's
// headline row uses), the health states from sourceHealth, and the activity item
// from buildActivity. Nothing is recomputed, so Overview cannot disagree with
// the tab it summarises.

const CARD_TITLE = "text-sm font-semibold text-ink-900";
const CARD_SUB = "mt-0.5 text-xs text-ink-500";
const CARD_LINK = "group inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand-700 hover:underline";

// ── 1. How is this client performing? ───────────────────────────────────────

export type PerformanceGlance =
  /** At least one source has a synced snapshot. `metrics` may still be empty. */
  | { kind: "data"; metrics: OverviewMetric[]; sourceCount: number }
  /** Connected, but nothing has landed yet. */
  | { kind: "awaiting"; sourceCount: number }
  | { kind: "none" };

/** Beyond this the row stops being a glance and becomes the Performance tab. */
const MAX_METRICS = 8;

export function PerformancePanel({
  glance,
  periodLabel,
  performanceHref,
  dataSourcesHref,
}: {
  glance: PerformanceGlance;
  /** e.g. "Last 28 days" — the window these figures cover. */
  periodLabel: string;
  performanceHref: string;
  dataSourcesHref: string;
}) {
  const shown = glance.kind === "data" ? glance.metrics.slice(0, MAX_METRICS) : [];
  const hidden = glance.kind === "data" ? Math.max(0, glance.metrics.length - shown.length) : 0;

  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className={CARD_TITLE}>Performance</h2>
          {glance.kind === "data" && (
            <Link href={performanceHref} className={CARD_LINK}>
              Full performance
              <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          )}
        </div>

        <p className={CARD_SUB}>
          {glance.kind === "data"
            ? `${periodLabel} · ${glance.sourceCount} source${glance.sourceCount === 1 ? "" : "s"} with data`
            : glance.kind === "awaiting"
              ? "Waiting on the first sync"
              : "Nothing connected yet"}
        </p>

        {glance.kind === "data" && shown.length > 0 && (
          <>
            {/* One headline per channel, each labelled with where it came from.
                Channels measure different things, so they are never added up —
                the same rule the Performance tab states in full. */}
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 xl:grid-cols-4">
              {shown.map((m) => (
                <div key={`${m.group}-${m.label}`}>
                  <p className="text-xs text-ink-500">{m.label}</p>
                  <p className="mt-0.5 text-xl font-semibold tracking-tight text-ink-900">{m.value ?? "—"}</p>
                  <p className="mt-0.5 truncate text-[11px] text-ink-400" title={m.source}>{m.source}</p>
                </div>
              ))}
            </div>
            <p className="mt-auto pt-4 text-[11px] leading-relaxed text-ink-400">
              Each figure comes from the channel named beneath it, never combined across channels.
              {hidden > 0 ? ` ${hidden} more on the Performance tab.` : ""}
            </p>
          </>
        )}

        {/* A source can carry charts without contributing a headline figure —
            say so plainly rather than showing an empty row. */}
        {glance.kind === "data" && shown.length === 0 && (
          <p className="mt-4 text-sm leading-relaxed text-ink-500">
            {glance.sourceCount} source{glance.sourceCount === 1 ? " has" : "s have"} synced data. Their charts and
            metrics are on the Performance tab.
          </p>
        )}

        {glance.kind === "awaiting" && (
          <p className="mt-4 text-sm leading-relaxed text-ink-500">
            {glance.sourceCount} source{glance.sourceCount === 1 ? " is" : "s are"} connected. Figures appear here as
            soon as the first sync lands.
          </p>
        )}

        {glance.kind === "none" && (
          <>
            <p className="mt-4 text-sm leading-relaxed text-ink-500">
              Connect Search Console, GA4, Meta Ads or any other platform and this client&apos;s headline numbers
              appear here automatically.
            </p>
            <Button asChild size="sm" className="mt-4 self-start">
              <Link href={dataSourcesHref}>Connect a data source</Link>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── 2 + 3. Anything needing attention, and how fresh the data is ────────────

export type AttentionSource = { name: string; health: SourceHealth };

/** Worst state wins the summary badge, in the order that blocks work. */
const WORST_FIRST: SourceHealth[] = ["needs_reconnect", "sync_error", "needs_account"];
/** Shown in full; the rest are counted. Three keeps the panel one screen. */
const MAX_ATTENTION = 3;

export function DataHealthPanel({
  connectedCount,
  attention,
  lastSyncedAt,
  blockedReason,
  dataSourcesHref,
}: {
  connectedCount: number;
  attention: AttentionSource[];
  lastSyncedAt: string | null;
  /** Why reporting is blocked, when it is. Same string the other tabs show. */
  blockedReason?: string;
  dataSourcesHref: string;
}) {
  const worst = WORST_FIRST.find((h) => attention.some((a) => a.health === h));
  const healthy = connectedCount - attention.length;

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className={CARD_TITLE}>Data sources</h2>
            <p className={CARD_SUB}>
              {connectedCount === 0
                ? "None connected"
                : attention.length === 0
                  ? `${connectedCount} connected`
                  : `${healthy} of ${connectedCount} healthy`}
            </p>
          </div>
          {/* Health and freshness are different facts: a source can be perfectly
              configured and still have nothing to show, so a client whose first
              sync hasn't landed says that rather than "all healthy". */}
          <Badge
            dot
            variant={
              connectedCount === 0 ? "muted" : worst ? SOURCE_HEALTH[worst].variant : lastSyncedAt ? "success" : "info"
            }
          >
            {connectedCount === 0
              ? "Not connected"
              : worst
                ? `${attention.length} to fix`
                : lastSyncedAt
                  ? "All healthy"
                  : "Awaiting sync"}
          </Badge>
        </div>

        {attention.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {attention.slice(0, MAX_ATTENTION).map((a) => (
              <li key={a.name} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-1.5 text-ink-700">
                  <AlertTriangle size={13} className="shrink-0 text-warning-600" aria-hidden />
                  <span className="truncate">{a.name}</span>
                </span>
                <span className="shrink-0 text-ink-500">{SOURCE_HEALTH[a.health].short}</span>
              </li>
            ))}
            {attention.length > MAX_ATTENTION && (
              <li className="text-xs text-ink-500">+{attention.length - MAX_ATTENTION} more</li>
            )}
          </ul>
        )}

        {blockedReason && (
          <p className="mt-3 rounded-lg bg-surface-subtle px-3 py-2 text-xs leading-relaxed text-ink-600">
            {blockedReason}
          </p>
        )}

        {/* Freshness sits with the sources it describes — it is a property of
            the syncs, not a statistic of its own. With nothing connected there
            is no sync to date, so the line is absent rather than empty. */}
        {connectedCount > 0 && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-500">
            <RefreshCw size={12} className="shrink-0" aria-hidden />
            {lastSyncedAt ? (
              <span>
                Data updated{" "}
                <time dateTime={lastSyncedAt} className="font-medium text-ink-700">
                  {formatDistanceToNow(new Date(lastSyncedAt), { addSuffix: true })}
                </time>
              </span>
            ) : (
              <span>No sync has completed yet</span>
            )}
          </p>
        )}

        <Button asChild variant="outline" size="sm" className="mt-4 w-full">
          <Link href={dataSourcesHref}>{connectedCount === 0 ? "Connect a data source" : "Review data sources"}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

// ── 4. The latest reporting activity ────────────────────────────────────────

// Icon names, not components: a Server Component can't hand a function to a
// Client Component, and keeping the convention avoids the trap. Same mapping
// the dashboard timeline uses, for the kinds a single client can produce.
const ICONS: Record<string, LucideIcon> = {
  file: FileBarChart2,
  mail: Mail,
  "calendar-check": CalendarCheck,
  "mail-x": MailX,
};

const TONES: Record<ActivityTone, string> = {
  neutral: "bg-brand-50 text-brand-600",
  positive: "bg-success-50 text-success-600",
  warning: "bg-warning-50 text-warning-600",
  danger: "bg-danger-50 text-danger-600",
};

export function ReportingPanel({
  event,
  reportCount,
  schedule,
  reportsHref,
  automationsHref,
}: {
  /** The single most recent reporting event, or null when there is none. */
  event: ActivityEvent | null;
  reportCount: number;
  schedule: { frequency: string; nextRunAt: string } | null;
  reportsHref: string;
  automationsHref: string;
}) {
  const meta = event ? ACTIVITY_META[event.kind] : null;
  const Icon = meta ? ICONS[meta.icon] ?? Activity : Activity;

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className={CARD_TITLE}>Reporting</h2>
          <Link href={reportsHref} className={CARD_LINK}>
            All reports
            <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </div>
        <p className={CARD_SUB}>
          {reportCount === 0 ? "No reports yet" : `${reportCount} report${reportCount === 1 ? "" : "s"} for this client`}
        </p>

        {event && meta ? (
          <Link
            href={event.href ?? reportsHref}
            className="-mx-2 mt-3 flex gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-surface-subtle"
          >
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${TONES[meta.tone]}`}>
              <Icon size={13} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className={`text-sm font-medium ${meta.tone === "danger" ? "text-danger-700" : "text-ink-800"}`}>
                  {meta.label}
                </span>
                <time className="shrink-0 text-xs tabular-nums text-ink-500" dateTime={event.at}>
                  {formatDistanceToNow(new Date(event.at), { addSuffix: true })}
                </time>
              </span>
              {event.detail && (
                <span className={`mt-0.5 block truncate text-xs ${meta.tone === "danger" ? "text-danger-600" : "text-ink-500"}`}>
                  {event.detail}
                </span>
              )}
            </span>
          </Link>
        ) : (
          <p className="mt-3 text-xs leading-relaxed text-ink-500">
            Generated and emailed reports show up here, newest first.
          </p>
        )}

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-ink-100 pt-3 text-xs">
          <span className="flex min-w-0 items-center gap-1.5 text-ink-500">
            <CalendarClock size={13} className="shrink-0" aria-hidden />
            {schedule ? (
              <span className="truncate">
                Next <span className="font-medium text-ink-700">{format(new Date(schedule.nextRunAt), "d MMM")}</span>{" "}
                · {schedule.frequency}
              </span>
            ) : (
              <span className="truncate">No scheduled delivery</span>
            )}
          </span>
          <Link href={automationsHref} className="shrink-0 font-medium text-brand-700 hover:underline">
            {schedule ? "Change" : "Schedule"}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
