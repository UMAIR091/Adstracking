// Unified dashboard activity feed.
//
// Pure assembly: every event is derived from rows the dashboard already needs
// (clients, data_sources, reports, email_logs). Nothing new is written and no
// event is invented — if a fact isn't in the database it doesn't appear here.
//
// The feed exists because the same question ("what has happened lately?") was
// previously answered by three different partial lists. One ordered timeline
// with typed events is easier to scan and gives failures somewhere to surface
// instead of being silently absent.

/** Every kind of thing that can appear on the timeline. */
export type ActivityKind =
  | "client_added"
  | "integration_connected"
  | "sync_completed"
  | "sync_failed"
  | "report_generated"
  | "report_emailed"
  | "scheduled_report_sent"
  | "delivery_failed";

export type ActivityEvent = {
  kind: ActivityKind;
  /** ISO timestamp the event happened at. */
  at: string;
  /** Primary subject, usually the client name. */
  subject: string;
  /** Optional supporting text (an integration name, an error, a recipient). */
  detail?: string | null;
  /** Where clicking the event should go, when there's somewhere useful. */
  href?: string | null;
};

/** Severity drives colour and iconography; failures must read as failures. */
export type ActivityTone = "neutral" | "positive" | "warning" | "danger";

export const ACTIVITY_META: Record<ActivityKind, { label: string; icon: string; tone: ActivityTone }> = {
  client_added: { label: "Client added", icon: "user-plus", tone: "neutral" },
  integration_connected: { label: "Integration connected", icon: "plug", tone: "positive" },
  sync_completed: { label: "Sync completed", icon: "refresh", tone: "positive" },
  sync_failed: { label: "Sync failed", icon: "alert", tone: "danger" },
  report_generated: { label: "Report generated", icon: "file", tone: "neutral" },
  report_emailed: { label: "Report emailed", icon: "mail", tone: "positive" },
  scheduled_report_sent: { label: "Scheduled report sent", icon: "calendar-check", tone: "positive" },
  delivery_failed: { label: "Delivery failed", icon: "mail-x", tone: "danger" },
};

// Rows are typed structurally rather than against generated DB types so this
// module stays a pure function of what the page already selected.
export type ActivityInput = {
  clients: { id: string; name: string; created_at: string }[];
  sources: {
    client_id: string | null;
    type: string;
    created_at: string;
    last_synced_at?: string | null;
    last_sync_error?: string | null;
  }[];
  reports: { id: string; title: string; created_at: string; client_id?: string | null; clientName?: string | null }[];
  emails: {
    report_id: string | null;
    to_email: string;
    status: string;
    sent_at: string;
    error?: string | null;
    /**
     * How the send was triggered (email_logs.source). Rows written before that
     * column existed have no value; those are shown as a manual send, which is
     * exactly what the timeline displayed for them before, so no historical
     * event changes meaning.
     */
    source?: string | null;
  }[];
  /** Display names for integration types, e.g. { gsc: "Search Console" }. */
  integrationNames?: Record<string, string>;
};

/**
 * Flattens every source into one reverse-chronological timeline.
 *
 * A sync is reported as failed when the source carries an error, and as
 * completed otherwise — a source that has never synced produces neither, so
 * "nothing yet" stays visibly different from "it worked".
 */
export function buildActivity(input: ActivityInput, limit = 12): ActivityEvent[] {
  const clientName = new Map(input.clients.map((c) => [c.id, c.name]));
  const names = input.integrationNames ?? {};
  const reportById = new Map(input.reports.map((r) => [r.id, r]));
  const events: ActivityEvent[] = [];

  for (const c of input.clients) {
    events.push({ kind: "client_added", at: c.created_at, subject: c.name, href: `/dashboard/clients/${c.id}` });
  }

  for (const s of input.sources) {
    const subject = (s.client_id && clientName.get(s.client_id)) || "A client";
    const href = s.client_id ? `/dashboard/clients/${s.client_id}` : null;
    const label = names[s.type] ?? s.type.toUpperCase();

    events.push({ kind: "integration_connected", at: s.created_at, subject, detail: label, href });

    // A source reports at most one sync outcome: the most recent one. The
    // error field is authoritative — it is cleared on a successful sync.
    if (s.last_sync_error) {
      events.push({ kind: "sync_failed", at: s.last_synced_at ?? s.created_at, subject, detail: s.last_sync_error, href });
    } else if (s.last_synced_at) {
      events.push({ kind: "sync_completed", at: s.last_synced_at, subject, detail: label, href });
    }
  }

  for (const r of input.reports) {
    const subject = r.clientName ?? (r.client_id ? clientName.get(r.client_id) : null) ?? r.title;
    events.push({ kind: "report_generated", at: r.created_at, subject, detail: r.title, href: `/dashboard/reports/${r.id}` });
  }

  for (const e of input.emails) {
    const report = e.report_id ? reportById.get(e.report_id) : undefined;
    const subject = report?.clientName ?? report?.title ?? e.to_email;
    const href = e.report_id ? `/dashboard/reports/${e.report_id}` : null;

    if (e.status === "failed" || e.status === "bounced") {
      events.push({ kind: "delivery_failed", at: e.sent_at, subject, detail: e.error ?? `Couldn't deliver to ${e.to_email}`, href });
    } else if (e.status === "pending") {
      // In flight — not an outcome yet, so it stays off the timeline.
      continue;
    } else {
      events.push({
        // Only an explicit "scheduled" counts as automated. Unknown (NULL from
        // before the column, or an unrecognised value) falls back to manual
        // rather than guessing the workspace's automation was involved.
        kind: e.source === "scheduled" ? "scheduled_report_sent" : "report_emailed",
        at: e.sent_at,
        subject,
        detail: e.to_email,
        href,
      });
    }
  }

  return events
    .filter((e) => Boolean(e.at))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit);
}
