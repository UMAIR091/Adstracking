"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { CalendarClock, Send, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { HelpHint } from "@/components/ui/help-hint";
import { track, ANALYTICS } from "@/lib/analytics";
import { FREQUENCIES, type Frequency } from "@/lib/schedule";

export type ScheduleData = {
  frequency: Frequency;
  recipients: string[];
  enabled: boolean;
  next_run_at: string;
  send_day: number | null;
  send_hour: number | null;
  subject: string | null;
  message: string | null;
} | null;

const FREQ_LABEL: Record<Frequency, string> = { weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly" };
const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function ReportSchedule({
  clientId,
  clientEmail,
  schedule,
  brandingReady = true,
  dataReady = true,
  dataBlockedReason,
}: {
  clientId: string;
  clientEmail: string | null;
  schedule: ScheduleData;
  /** Minimum branding (a logo) is set — scheduling is blocked until it is, so
   *  automated reports never go out unbranded (journey audit P0-2). */
  brandingReady?: boolean;
  /** A synced snapshot exists, so a report can actually be built. Sending
   *  without one fails server-side, so the buttons are gated rather than
   *  letting the click produce an error the user has to interpret. */
  dataReady?: boolean;
  /** Which stage of setup is missing, for an actionable message. */
  dataBlockedReason?: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [frequency, setFrequency] = useState<Frequency>(schedule?.frequency ?? "monthly");
  const [sendDay, setSendDay] = useState<number>(schedule?.send_day ?? (schedule?.frequency === "weekly" ? 1 : 1));
  const [sendHour, setSendHour] = useState<number>(schedule?.send_hour ?? 8);
  const [recipients, setRecipients] = useState(
    (schedule?.recipients?.length ? schedule.recipients : clientEmail ? [clientEmail] : []).join(", ")
  );
  const [subject, setSubject] = useState(schedule?.subject ?? "");
  const [message, setMessage] = useState(schedule?.message ?? "");
  const [busy, setBusy] = useState(false);

  const recipientList = () => recipients.split(",").map((s) => s.trim()).filter((s) => s.includes("@"));

  async function save(enabled: boolean) {
    if (enabled && recipientList().length === 0) {
      toast.error("Add at least one recipient email.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, frequency, sendDay, sendHour, recipients: recipientList(), subject: subject || null, message: message || null, enabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error(data.error ?? "Couldn't save the schedule");
      toast.success(enabled ? "Automated delivery scheduled" : "Schedule paused");
      if (enabled) track(ANALYTICS.scheduleCreated, { frequency });
      router.refresh();
    } catch {
      toast.error("Couldn't reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function run(mode: "now" | "test") {
    setBusy(true);
    try {
      const res = await fetch("/api/schedules/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, mode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error(data.error ?? "Couldn't send");
      toast.success(mode === "test" ? "Test email sent to you" : `Report sent to ${data.sent} recipient${data.sent === 1 ? "" : "s"}`);
      router.refresh();
    } catch {
      toast.error("Couldn't reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!(await confirm({ title: "Stop automated delivery?", description: "This client’s scheduled reports will no longer be generated or emailed automatically. You can re-enable it any time.", confirmLabel: "Stop delivery", destructive: true }))) return;
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
              <p className="flex items-center gap-1.5 font-medium text-ink-900">
                Automated delivery
                <HelpHint label="About automated delivery">Set it once and ReportFlow generates, writes and emails a branded PDF on your schedule — from your domain, with delivery history. True set-and-forget.</HelpHint>
              </p>
              <p className="text-sm text-ink-500">
                {active && schedule
                  ? `${FREQ_LABEL[schedule.frequency]} · next ${formatDistanceToNow(new Date(schedule.next_run_at), { addSuffix: true })}`
                  : "Generate and email a branded PDF report on a schedule."}
              </p>
            </div>
          </div>
          {schedule && (
            <button onClick={remove} disabled={busy} className="text-xs text-ink-500 transition-colors hover:text-red-600 disabled:opacity-50">
              Remove
            </button>
          )}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Field label="Frequency">
            <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)} className={selectCls}>
              {FREQUENCIES.map((f) => <option key={f} value={f}>{FREQ_LABEL[f]}</option>)}
            </select>
          </Field>
          <Field label={frequency === "weekly" ? "Day of week" : "Day of month"}>
            {frequency === "weekly" ? (
              <select value={sendDay} onChange={(e) => setSendDay(Number(e.target.value))} className={selectCls}>
                {DOW.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            ) : (
              <select value={sendDay} onChange={(e) => setSendDay(Number(e.target.value))} className={selectCls}>
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            )}
          </Field>
          <Field label="Time (UTC)">
            <select value={sendHour} onChange={(e) => setSendHour(Number(e.target.value))} className={selectCls}>
              {Array.from({ length: 24 }, (_, h) => h).map((h) => (
                <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="mt-3">
          <Field label="Recipients (comma-separated)">
            <input value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="client@example.com, cc@example.com" className={inputCls} />
          </Field>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Email subject (optional)">
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Your monthly performance report" className={inputCls} />
          </Field>
          <Field label="Message (optional)">
            <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="A short note to your client…" className={inputCls} />
          </Field>
        </div>

        {/* Nothing can be built or sent until a source has actually synced.
            Shown first because it blocks more than branding does. */}
        {!dataReady && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-xs text-amber-800">
              {dataBlockedReason ?? "Connect a data source and run a sync before scheduling — there's no data to report on yet."}
            </p>
          </div>
        )}

        {!brandingReady && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-xs text-amber-800">Add your agency logo before scheduling — it keeps client reports on-brand.</p>
            <a href="/dashboard/settings" className="text-xs font-semibold text-amber-800 hover:underline">Set up branding →</a>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button onClick={() => save(true)} disabled={busy || !brandingReady || !dataReady}>
            {busy ? "Saving…" : active ? "Update schedule" : "Schedule"}
          </Button>
          {active && <Button variant="outline" onClick={() => save(false)} disabled={busy}>Pause</Button>}
          <div className="flex-1" />
          {/* Both send paths generate a report first, so they need data just as
              much as the schedule does. Leaving them enabled turned a missing
              sync into an error toast after the click. */}
          <Button
            variant="outline"
            onClick={() => run("test")}
            disabled={busy || !dataReady}
            title={!dataReady ? "Connect and sync a data source first" : undefined}
          >
            <FlaskConical size={15} aria-hidden /> Send test
          </Button>
          <Button
            variant="outline"
            onClick={() => run("now")}
            disabled={busy || !dataReady}
            title={!dataReady ? "Connect and sync a data source first" : undefined}
          >
            <Send size={15} aria-hidden /> Send now
          </Button>
        </div>
        <p className="mt-3 text-xs text-ink-500">Reports are generated from the latest synced data and emailed as a branded PDF under your branding. Times are UTC.</p>
      </CardContent>
    </Card>
  );
}

const selectCls = "h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
const inputCls = selectCls;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-ink-700">{label}</label>
      {children}
    </div>
  );
}
