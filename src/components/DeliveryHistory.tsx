import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type DeliveryLog = {
  id: string;
  to_email: string;
  subject: string | null;
  status: string;
  sent_at: string;
  attempts: number | null;
  error: string | null;
  /**
   * How the send was triggered (email_logs.source). Rows written before that
   * column existed carry no value; those read as a manual send, which is what
   * they displayed as before, so no historical row changes meaning.
   */
  source?: string | null;
};

const STATUS_STYLE: Record<string, string> = {
  sent: "bg-success-50 text-success-700 border-success-100",
  delivered: "bg-success-50 text-success-700 border-success-100",
  opened: "bg-success-50 text-success-700 border-success-100",
  clicked: "bg-success-50 text-success-700 border-success-100",
  pending: "bg-warning-50 text-warning-700 border-warning-100",
  failed: "bg-danger-50 text-danger-700 border-danger-100",
  bounced: "bg-danger-50 text-danger-700 border-danger-100",
};

// Delivery history for emailed reports — Sent / Pending / Failed.
//
// `showEmpty` distinguishes the two callers. On a client page an empty history
// is noise and the card is omitted entirely; on a report page its absence is
// itself the answer ("this was never sent"), so it renders an explanatory
// state rather than vanishing and leaving the question open.
//
// `bare` drops the component's own card chrome for a caller that already
// provides a section heading, so the word "Delivery history" isn't printed
// twice above the same list.
export function DeliveryHistory({
  logs,
  showEmpty = true,
  bare = false,
}: {
  logs: DeliveryLog[];
  showEmpty?: boolean;
  bare?: boolean;
}) {
  const frame = (children: React.ReactNode) =>
    bare ? (
      <>{children}</>
    ) : (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Delivery history</CardTitle>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    );

  if (logs.length === 0) {
    if (!showEmpty) return null;
    return frame(
      <div className="rounded-xl border border-dashed border-ink-200 px-4 py-6 text-center">
        <p className="text-sm font-medium text-ink-800">Not emailed yet</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-ink-500">
          Use <span className="font-medium text-ink-700">Email report</span> above to send it now, or set a
          schedule on the client so it goes out automatically. Every send — and any failure — is recorded here.
        </p>
      </div>
    );
  }

  return frame(
    <ul className={bare ? "divide-y divide-ink-100 rounded-xl border border-ink-200 bg-surface" : "divide-y divide-ink-100"}>
      {logs.map((l) => (
        <li key={l.id} className={`flex items-center justify-between gap-3 ${bare ? "px-4 py-2.5" : "py-2.5"}`}>
          <div className="min-w-0">
            <p className="truncate text-sm text-ink-800">{l.to_email}</p>
            <p className="truncate text-xs text-ink-500">
              {/* Only shown to callers that actually select the column: an
                  absent field means "not asked for", which is not the same as
                  a row that predates it. Where it IS asked for, only an
                  explicit "scheduled" counts as automated — an unknown value is
                  not evidence the automation ran. */}
              {l.source === undefined ? "" : l.source === "scheduled" ? "Scheduled · " : "Manual · "}
              {formatDistanceToNow(new Date(l.sent_at), { addSuffix: true })}
              {l.status === "failed" && l.error ? ` · ${l.error}` : ""}
              {(l.attempts ?? 0) > 1 ? ` · ${l.attempts} attempts` : ""}
            </p>
          </div>
          <span className={`flex-shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${STATUS_STYLE[l.status] ?? "bg-ink-50 text-ink-600 border-ink-100"}`}>
            {l.status}
          </span>
        </li>
      ))}
    </ul>
  );
}
