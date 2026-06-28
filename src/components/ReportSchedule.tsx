"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FREQUENCIES, type Frequency } from "@/lib/schedule";

export type ScheduleData = {
  frequency: Frequency;
  recipients: string[];
  enabled: boolean;
  next_run_at: string;
} | null;

const FREQ_LABEL: Record<Frequency, string> = { weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly" };

// Per-client automated report delivery: pick a cadence and recipients, and the
// daily cron generates + emails the report on schedule.
export function ReportSchedule({
  clientId,
  clientEmail,
  schedule,
}: {
  clientId: string;
  clientEmail: string | null;
  schedule: ScheduleData;
}) {
  const router = useRouter();
  const [frequency, setFrequency] = useState<Frequency>(schedule?.frequency ?? "monthly");
  const [recipients, setRecipients] = useState(
    (schedule?.recipients?.length ? schedule.recipients : clientEmail ? [clientEmail] : []).join(", ")
  );
  const [busy, setBusy] = useState(false);

  async function save(enabled: boolean) {
    const list = recipients.split(",").map((s) => s.trim()).filter((s) => s.includes("@"));
    if (enabled && list.length === 0) {
      toast.error("Add at least one recipient email.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, frequency, recipients: list, enabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Couldn't save the schedule");
        return;
      }
      toast.success(enabled ? "Automated delivery scheduled" : "Schedule paused");
      router.refresh();
    } catch {
      toast.error("Couldn't reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Stop automated delivery for this client?")) return;
    setBusy(true);
    await fetch(`/api/schedules?clientId=${clientId}`, { method: "DELETE" });
    setBusy(false);
    toast.success("Automated delivery removed");
    router.refresh();
  }

  const active = schedule?.enabled;

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <CalendarClock size={18} />
            </div>
            <div>
              <p className="font-medium text-ink-900">Automated delivery</p>
              <p className="text-sm text-ink-500">
                {active && schedule
                  ? `${FREQ_LABEL[schedule.frequency]} · next ${formatDistanceToNow(new Date(schedule.next_run_at), { addSuffix: true })}`
                  : "Generate and email this report on a schedule."}
              </p>
            </div>
          </div>
          {schedule && (
            <button onClick={remove} disabled={busy} className="text-xs text-ink-500 transition-colors hover:text-red-600 disabled:opacity-50">
              Remove
            </button>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-700">Frequency</label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as Frequency)}
              className="h-10 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            >
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>{FREQ_LABEL[f]}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-ink-700">Recipients (comma-separated)</label>
            <input
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              placeholder="client@example.com"
              className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <Button onClick={() => save(true)} disabled={busy}>
            {busy ? "Saving…" : active ? "Update" : "Schedule"}
          </Button>
          {active && (
            <Button variant="outline" onClick={() => save(false)} disabled={busy}>
              Pause
            </Button>
          )}
        </div>
        <p className="mt-3 text-xs text-ink-400">Reports are generated from the latest synced data and emailed under your branding.</p>
      </CardContent>
    </Card>
  );
}
