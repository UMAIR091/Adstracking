import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ACTIVITY_META, type ActivityEvent, type ActivityTone } from "@/lib/dashboard/activity";
import { StatusDot, type StatusTone } from "@/components/ui/status-chip";

// Tone drives the dot, so a failure can never be mistaken for a success at a
// glance; failures also keep their red text.
const DOT: Record<ActivityTone, StatusTone> = {
  neutral: "info",
  positive: "success",
  warning: "warning",
  danger: "danger",
};

function Row({ event }: { event: ActivityEvent }) {
  const meta = ACTIVITY_META[event.kind];
  const body = (
    <div className="flex gap-3">
      <StatusDot tone={DOT[meta.tone]} className="mt-1.5 h-2 w-2" />
      <div className="min-w-0 flex-1">
        <p className={`text-[13.5px] leading-snug ${meta.tone === "danger" ? "text-danger-700" : "text-ink-900"}`}>
          {meta.label}
          <span className="text-ink-500"> · {event.subject}</span>
        </p>
        {event.detail && (
          <p className={`mt-0.5 truncate text-xs ${meta.tone === "danger" ? "text-danger-600" : "text-ink-400"}`}>{event.detail}</p>
        )}
        <time className="mt-0.5 block text-xs text-ink-400" dateTime={event.at}>
          {formatDistanceToNow(new Date(event.at), { addSuffix: true })}
        </time>
      </div>
    </div>
  );

  return (
    <li>
      {event.href ? (
        <Link href={event.href} className="-mx-2 block rounded-lg px-2 py-2 transition-colors hover:bg-ink-50">
          {body}
        </Link>
      ) : (
        <div className="py-2">{body}</div>
      )}
    </li>
  );
}

/**
 * Reverse-chronological feed of everything that has happened in the workspace.
 * The empty state names the events that will appear here, so a new user learns
 * what the product does for them instead of reading "no activity".
 */
export function ActivityTimeline({ events }: { events: ActivityEvent[] }) {
  return (
    <section aria-labelledby="activity-heading" className="rounded-card border border-ink-200 bg-surface px-[18px] py-4">
      <h2 id="activity-heading" className="text-[15px] font-semibold text-ink-900">Recent activity</h2>
      {events.length > 0 ? (
        <ol className="mt-1.5">
          {events.map((e, i) => (
            <Row key={`${e.kind}-${e.at}-${i}`} event={e} />
          ))}
        </ol>
      ) : (
        <div className="mt-2">
          <p className="text-[13.5px] leading-relaxed text-ink-500">
            As you work, this records what happened and when, so you can answer &ldquo;did that client&apos;s report go
            out?&rdquo; without digging: clients you add, integrations you connect, syncs that complete or fail, and
            reports generated and emailed.
          </p>
        </div>
      )}
    </section>
  );
}
