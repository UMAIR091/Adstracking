"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { CalendarClock, Send, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
}: {
  clientId: string;
  clientEmail: string | null;
  schedule: ScheduleData;
}) {
  const router = useRouter();
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

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button onClick={() => save(true)} disabled={busy}>{busy ? "Saving…" : active ? "Update schedule" : "Schedule"}</Button>
          {active && <Button variant="outline" onClick={() => save(false)} disabled={busy}>Pause</Button>}
          <div className="flex-1" />
          <Button variant="outline" onClick={() => run("test")} disabled={busy}><FlaskConical size={15} /> Send test</Button>
          <Button variant="outline" onClick={() => run("now")} disabled={busy}><Send size={15} /> Send now</Button>
        </div>
        <p className="mt-3 text-xs text-ink-400">Reports are generated from the latest synced data and emailed as a branded PDF under your branding. Times are UTC.</p>
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
