"use client";

// Returning-user summary (journey audit P2-9). Shows what happened while the
// user was away, so a set-and-forget product surfaces its ongoing value. Only
// rendered on a genuine return (server gates on time-since-last-seen), and only
// with meaningful stats. Dismissible for the session.
import { useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { X, FileBarChart2, RefreshCw, CalendarClock, AlertTriangle, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export type WelcomeBackData = {
  lastSeen: string;
  reportsSent: number;
  syncedSources: number;
  failedSyncs: number;
  schedulesToday: number;
};

export function WelcomeBack({ data }: { data: WelcomeBackData }) {
  const [open, setOpen] = useState(true);
  if (!open) return null;

  const stats = [
    { show: data.reportsSent > 0, icon: FileBarChart2, tint: "text-brand-600", label: `${data.reportsSent} report${data.reportsSent === 1 ? "" : "s"} generated` },
    { show: data.syncedSources > 0, icon: RefreshCw, tint: "text-emerald-600", label: `${data.syncedSources} source${data.syncedSources === 1 ? "" : "s"} refreshed` },
    { show: data.schedulesToday > 0, icon: CalendarClock, tint: "text-sky-600", label: `${data.schedulesToday} scheduled today` },
  ].filter((s) => s.show);

  return (
    <Card className="border-brand-100 bg-gradient-to-br from-brand-50/60 to-white">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink-900">
            <Sparkles size={16} className="text-brand-500" />
            While you were away
            <span className="font-normal text-ink-500">· since {formatDistanceToNow(new Date(data.lastSeen), { addSuffix: true })}</span>
          </div>
          <button onClick={() => setOpen(false)} aria-label="Dismiss" className="rounded-md p-1 text-ink-400 hover:bg-white hover:text-ink-600">
            <X size={16} />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
          {stats.map((s) => (
            <div key={s.label} className="flex items-center gap-2 text-sm text-ink-700">
              <s.icon size={15} className={s.tint} /> {s.label}
            </div>
          ))}
        </div>

        {data.failedSyncs > 0 && (
          <Link href="/dashboard/settings/health" className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 hover:bg-amber-100">
            <AlertTriangle size={15} className="flex-shrink-0 text-amber-600" />
            {data.failedSyncs} source{data.failedSyncs === 1 ? "" : "s"} need{data.failedSyncs === 1 ? "s" : ""} attention — reconnect to keep reports accurate →
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
