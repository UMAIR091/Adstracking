import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { CalendarClock, Send, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export type NextScheduledData = {
  clientId: string | null;
  clientName: string;
  frequency: string;
  nextRunAt: string;
  /** How many other schedules are queued behind this one. */
  alsoQueued: number;
};

/**
 * The single most imminent scheduled delivery, given its own card.
 *
 * "What goes out next, and when" is the question automated delivery is meant
 * to answer, but it was previously buried in a list of five equal rows. Lifting
 * the nearest one out makes the automation visible — the product feels like it
 * is working on the user's behalf rather than sitting idle.
 */
export function NextScheduled({ data }: { data: NextScheduledData | null }) {
  if (!data) {
    return (
      <Card className="h-full">
        <CardContent className="flex h-full flex-col p-5">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <CalendarClock size={17} aria-hidden />
            </span>
            <p className="text-sm font-medium text-ink-700">Next scheduled report</p>
          </div>
          <p className="mt-3 text-sm font-medium text-ink-800">Nothing scheduled yet</p>
          <p className="mt-1 flex-1 text-xs leading-relaxed text-ink-500">
            Put a client on a weekly or monthly schedule and ReportFlow generates the report, attaches the PDF and
            emails it — without you opening the app.
          </p>
          <Button asChild size="sm" variant="outline" className="mt-4 self-start">
            <Link href="/dashboard/clients">Set up a schedule</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const when = new Date(data.nextRunAt);

  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <CalendarClock size={17} aria-hidden />
            </span>
            <p className="text-sm font-medium text-ink-700">Next scheduled report</p>
          </div>
          <Badge variant="success">Active</Badge>
        </div>

        <p className="mt-3 truncate text-lg font-semibold tracking-tight text-ink-900">{data.clientName}</p>
        <p className="mt-0.5 text-sm text-ink-600">
          <span className="capitalize">{data.frequency}</span> · {format(when, "EEE d MMM, HH:mm")} UTC
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-brand-600">
          <Send size={12} aria-hidden />
          Sends {formatDistanceToNow(when, { addSuffix: true })}
        </p>

        <div className="mt-auto flex items-center justify-between gap-2 pt-4">
          <span className="text-xs text-ink-500">
            {data.alsoQueued > 0 ? `+${data.alsoQueued} more queued` : "Only one queued"}
          </span>
          {data.clientId && (
            <Link
              href={`/dashboard/clients/${data.clientId}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:gap-1.5"
            >
              Manage <ArrowRight size={12} aria-hidden />
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
