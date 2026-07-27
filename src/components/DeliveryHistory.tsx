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
};

const STATUS_STYLE: Record<string, string> = {
  sent: "bg-emerald-50 text-emerald-700 border-emerald-100",
  delivered: "bg-emerald-50 text-emerald-700 border-emerald-100",
  opened: "bg-emerald-50 text-emerald-700 border-emerald-100",
  clicked: "bg-emerald-50 text-emerald-700 border-emerald-100",
  pending: "bg-amber-50 text-amber-700 border-amber-100",
  failed: "bg-red-50 text-red-700 border-red-100",
  bounced: "bg-red-50 text-red-700 border-red-100",
};

// Delivery history for emailed reports — Sent / Pending / Failed.
//
// `showEmpty` distinguishes the two callers. On a client page an empty history
// is noise and the card is omitted entirely; on a report page its absence is
// itself the answer ("this was never sent"), so it renders an explanatory
// state rather than vanishing and leaving the question open.
export function DeliveryHistory({ logs, showEmpty = true }: { logs: DeliveryLog[]; showEmpty?: boolean }) {
  if (logs.length === 0) {
    if (!showEmpty) return null;
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Delivery history</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-dashed border-ink-200 px-4 py-6 text-center">
            <p className="text-sm font-medium text-ink-800">Not emailed yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-ink-500">
              Use <span className="font-medium text-ink-700">Email report</span> above to send it now, or set a
              schedule on the client so it goes out automatically. Every send — and any failure — is recorded here.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Delivery history</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-slate-100">
          {logs.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm text-ink-800">{l.to_email}</p>
                <p className="truncate text-xs text-ink-500">
                  {formatDistanceToNow(new Date(l.sent_at), { addSuffix: true })}
                  {l.status === "failed" && l.error ? ` · ${l.error}` : ""}
                  {(l.attempts ?? 0) > 1 ? ` · ${l.attempts} attempts` : ""}
                </p>
              </div>
              <span className={`flex-shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${STATUS_STYLE[l.status] ?? "bg-slate-50 text-slate-600 border-slate-100"}`}>
                {l.status}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
