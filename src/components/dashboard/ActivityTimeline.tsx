import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import {
  UserPlus, PlugZap, RefreshCw, AlertCircle, FileBarChart2, Mail, CalendarCheck, MailX, Activity,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ACTIVITY_META, type ActivityEvent, type ActivityTone } from "@/lib/dashboard/activity";

// Icon names are mapped here rather than passed from the server: a Server
// Component cannot serialise a component function across the boundary (this
// previously caused a production 500).
const ICONS: Record<string, LucideIcon> = {
  "user-plus": UserPlus,
  plug: PlugZap,
  refresh: RefreshCw,
  alert: AlertCircle,
  file: FileBarChart2,
  mail: Mail,
  "calendar-check": CalendarCheck,
  "mail-x": MailX,
};

// Tone drives the whole visual treatment so a failure can never be mistaken
// for a success at a glance.
const TONES: Record<ActivityTone, { dot: string; ring: string; text: string }> = {
  neutral: { dot: "bg-brand-50 text-brand-600", ring: "ring-brand-100", text: "text-ink-800" },
  positive: { dot: "bg-emerald-50 text-emerald-600", ring: "ring-emerald-100", text: "text-ink-800" },
  warning: { dot: "bg-amber-50 text-amber-600", ring: "ring-amber-100", text: "text-ink-800" },
  danger: { dot: "bg-rose-50 text-rose-600", ring: "ring-rose-100", text: "text-rose-700" },
};

function Row({ event, last }: { event: ActivityEvent; last: boolean }) {
  const meta = ACTIVITY_META[event.kind];
  const tone = TONES[meta.tone];
  const Icon = ICONS[meta.icon] ?? Activity;

  const body = (
    <div className="flex gap-3">
      {/* Rail: the icon is the timeline node, the line connects it downward. */}
      <div className="relative flex flex-col items-center">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1 ring-inset ${tone.dot} ${tone.ring}`}>
          <Icon size={14} aria-hidden />
        </span>
        {!last && <span className="mt-1 w-px flex-1 bg-ink-100" aria-hidden />}
      </div>

      <div className={`min-w-0 flex-1 ${last ? "pb-0" : "pb-4"}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <p className={`text-sm font-medium ${tone.text}`}>
            {meta.label}
            <span className="font-normal text-ink-500"> · {event.subject}</span>
          </p>
          <time className="shrink-0 text-xs tabular-nums text-ink-500" dateTime={event.at}>
            {formatDistanceToNow(new Date(event.at), { addSuffix: true })}
          </time>
        </div>
        {event.detail && (
          <p className={`mt-0.5 truncate text-xs ${meta.tone === "danger" ? "text-rose-600" : "text-ink-500"}`}>
            {event.detail}
          </p>
        )}
      </div>
    </div>
  );

  return (
    <li>
      {event.href ? (
        <Link
          href={event.href}
          className="-mx-2 block rounded-lg px-2 py-1 transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted"
        >
          {body}
        </Link>
      ) : (
        <div className="-mx-2 px-2 py-1">{body}</div>
      )}
    </li>
  );
}

/**
 * Reverse-chronological feed of everything that has happened in the workspace.
 *
 * The empty state teaches rather than apologising: it names the events that
 * will appear here, so a new user learns what the product does for them
 * instead of reading "no activity".
 */
export function ActivityTimeline({ events }: { events: ActivityEvent[] }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity size={16} className="text-brand-500" aria-hidden /> Activity
        </CardTitle>
        <CardDescription>Everything happening across your clients, newest first.</CardDescription>
      </CardHeader>
      <CardContent>
        {events.length > 0 ? (
          <ol className="space-y-0">
            {events.map((e, i) => (
              <Row key={`${e.kind}-${e.at}-${i}`} event={e} last={i === events.length - 1} />
            ))}
          </ol>
        ) : (
          <div className="rounded-xl border border-dashed border-ink-200 p-5">
            <p className="text-sm font-medium text-ink-800">Your activity feed starts here</p>
            <p className="mt-1 text-sm text-ink-500">
              As you work, this timeline records what happened and when — so you can answer &ldquo;did that client&apos;s
              report go out?&rdquo; without digging.
            </p>
            <ul className="mt-3 grid gap-1.5 text-xs text-ink-600 sm:grid-cols-2">
              {[
                "Clients you add",
                "Integrations you connect",
                "Syncs that complete or fail",
                "Reports generated and emailed",
              ].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <span className="h-1 w-1 shrink-0 rounded-full bg-ink-300" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
            <Button asChild size="sm" variant="outline" className="mt-4">
              <Link href="/dashboard/clients/new">Add your first client</Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
