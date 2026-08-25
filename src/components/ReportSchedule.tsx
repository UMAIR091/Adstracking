"use client";

// Automated delivery for one client: what is scheduled, and the form to change
// it.
//
// The form used to be the whole component — always open, whether or not a
// schedule existed — so the answer to "is this client on a schedule, to whom,
// and when does it next go out?" was a subtitle above six inputs. Those are two
// different jobs, so they are now two parts: a status the user reads, and an
// editor they open when they want to change something. With no schedule yet the
// editor starts open, because creating one is the only thing to do.
//
// Every request is unchanged — same routes, same payloads, same gating on
// branding and synced data. Only the arrangement is new.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { CalendarClock, Send, FlaskConical, Pencil, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { HelpHint } from "@/components/ui/help-hint";
import { track, ANALYTICS } from "@/lib/analytics";
import { FREQUENCIES, SCHEDULE_PERIODS, periodForSchedule, type Frequency } from "@/lib/schedule";

export type ScheduleData = {
  frequency: Frequency;
  recipients: string[];
  enabled: boolean;
  next_run_at: string;
  send_day: number | null;
  send_hour: number | null;
  subject: string | null;
  message: string | null;
  /** Pinned reporting window; null = match the frequency. */
  period: string | null;
} | null;

const FREQ_LABEL: Record<Frequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
  quarterly: "Quarterly",
};

// Daily is the one cadence with no day to choose — every day is the day.
const HAS_SEND_DAY = (f: Frequency) => f !== "daily";
const IS_WEEKDAY_CADENCE = (f: Frequency) => f === "weekly" || f === "biweekly";

// What the schedule actually reports on, resolved the same way the cron
// resolves it — so the note can never claim a window the delivery won't use.
// Reads the preset's own label rather than a second copy of the wording, which
// is how "monthly" once came to advertise a calendar month while sending 28
// rolling days.
function periodNote(frequency: Frequency, period: string | null): string {
  const id = periodForSchedule(frequency, period);
  const label = SCHEDULE_PERIODS.find((p) => p.id === id)?.label ?? id;
  return `Covers ${label.toLowerCase()}`;
}
const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// The send hour is chosen in UTC and the note below says so, so the next run is
// stated in UTC too. Formatting it locally would quietly disagree with the
// control that set it.
function utcStamp(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hh}:${mm} UTC`;
}

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
  // "" is the stored null: match the frequency.
  const [period, setPeriod] = useState<string>(schedule?.period ?? "");
  const [recipients, setRecipients] = useState(
    (schedule?.recipients?.length ? schedule.recipients : clientEmail ? [clientEmail] : []).join(", ")
  );
  const [subject, setSubject] = useState(schedule?.subject ?? "");
  const [message, setMessage] = useState(schedule?.message ?? "");
  const [busy, setBusy] = useState(false);
  // Nothing scheduled yet means there is nothing to read, so the editor leads.
  const [editing, setEditing] = useState(!schedule);

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
        body: JSON.stringify({ clientId, frequency, period: period || null, sendDay, sendHour, recipients: recipientList(), subject: subject || null, message: message || null, enabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error(data.error ?? "Couldn't save the schedule");
      toast.success(enabled ? "Automated delivery scheduled" : "Schedule paused");
      if (enabled) track(ANALYTICS.scheduleCreated, { frequency });
      // The saved schedule is now worth reading rather than editing.
      setEditing(false);
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
    setEditing(true);
    router.refresh();
  }

  const active = Boolean(schedule?.enabled);
  const exists = Boolean(schedule);
  const savedRecipients = schedule?.recipients ?? [];
  const blocked = !brandingReady || !dataReady;

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <CalendarClock size={18} />
            </div>
            <div>
              <p className="flex flex-wrap items-center gap-2 font-medium text-ink-900">
                Automated delivery
                {/* The hint stays next to the title: its tooltip is a fixed-width
                    box centred on the icon, so pushing the icon further right
                    pushes the tooltip off a narrow screen. */}
                <HelpHint label="About automated delivery">Set it once and ReportFlow generates, writes and emails a branded PDF on your schedule — from your domain, with delivery history. True set-and-forget.</HelpHint>
                {/* Whether this client is on a schedule is the question the tab
                    exists to answer, so it is stated up front rather than
                    inferred from the state of the form. */}
                <Badge dot variant={active ? "success" : exists ? "warning" : "muted"}>
                  {active ? "Active" : exists ? "Paused" : "Not scheduled"}
                </Badge>
              </p>
              {/* An active schedule says nothing here: cadence, next delivery
                  and recipients are stated in full immediately below, and
                  repeating two of them in a subtitle is just noise. */}
              {!active && (
                <p className="mt-0.5 text-sm text-ink-500">
                  {exists
                    ? "Paused — nothing goes out until you resume it."
                    : "Generate and email a branded PDF report on a schedule."}
                </p>
              )}
            </div>
          </div>
          {exists && (
            <button onClick={remove} disabled={busy} className="text-xs text-ink-500 transition-colors hover:text-danger-600 disabled:opacity-50">
              Remove
            </button>
          )}
        </div>

        {/* What is actually set, without opening anything. */}
        {exists && schedule && (
          <dl className="mt-4 grid gap-4 rounded-xl border border-ink-100 bg-surface-muted/40 p-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-ink-500">Cadence</dt>
              <dd className="mt-0.5 text-sm font-medium text-ink-800">{FREQ_LABEL[schedule.frequency]}</dd>
              <dd className="mt-0.5 text-xs text-ink-500">{periodNote(schedule.frequency, schedule.period)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">Next delivery</dt>
              <dd className="mt-0.5 text-sm font-medium text-ink-800">
                {active ? utcStamp(schedule.next_run_at) : "Paused"}
              </dd>
              {active && (
                <dd className="mt-0.5 text-xs text-ink-500">
                  {formatDistanceToNow(new Date(schedule.next_run_at), { addSuffix: true })}
                </dd>
              )}
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-ink-500">
                Recipients{savedRecipients.length > 1 ? ` (${savedRecipients.length})` : ""}
              </dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {savedRecipients.length === 0 ? (
                  <span className="text-sm text-ink-500">None</span>
                ) : (
                  savedRecipients.map((r) => (
                    <span
                      key={r}
                      title={r}
                      className="inline-flex max-w-full items-center gap-1 truncate rounded-full border border-ink-200 bg-surface px-2 py-0.5 text-xs text-ink-700"
                    >
                      <Users size={11} className="shrink-0 text-ink-400" aria-hidden />
                      <span className="truncate">{r}</span>
                    </span>
                  ))
                )}
              </dd>
            </div>
          </dl>
        )}

        {/* Nothing can be built or sent until a source has actually synced.
            Shown first because it blocks more than branding does. */}
        {!dataReady && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2">
            <p className="text-xs text-warning-800">
              {dataBlockedReason ?? "Connect a data source and run a sync before scheduling — there's no data to report on yet."}
            </p>
          </div>
        )}

        {!brandingReady && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2">
            <p className="text-xs text-warning-800">Add your agency logo before scheduling — it keeps client reports on-brand.</p>
            <a href="/dashboard/settings" className="text-xs font-semibold text-warning-800 hover:underline">Set up branding →</a>
          </div>
        )}

        {/* Actions on the existing schedule. The editor carries its own save, so
            exactly one filled button is on screen in every state. */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {exists &&
            (active ? (
              <Button variant="outline" onClick={() => save(false)} disabled={busy}>
                Pause
              </Button>
            ) : (
              <Button onClick={() => save(true)} disabled={busy || blocked}>
                Resume delivery
              </Button>
            ))}
          {exists && (
            <Button variant="outline" onClick={() => setEditing((v) => !v)} aria-expanded={editing} disabled={busy}>
              <Pencil size={15} aria-hidden /> {editing ? "Close editor" : "Edit schedule"}
            </Button>
          )}
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

        {editing && (
          <div className={exists ? "mt-5 border-t border-ink-100 pt-5" : "mt-5"}>
            {/* Four controls, three when the cadence is daily. Two columns on a
                phone, four across once there's room, so dropping the day field
                reflows instead of leaving a hole. */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Frequency">
                <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)} className={selectCls}>
                  {FREQUENCIES.map((f) => <option key={f} value={f}>{FREQ_LABEL[f]}</option>)}
                </select>
              </Field>
              {HAS_SEND_DAY(frequency) && (
                <Field label={IS_WEEKDAY_CADENCE(frequency) ? "Day of week" : "Day of month"}>
                  {IS_WEEKDAY_CADENCE(frequency) ? (
                    <select value={sendDay} onChange={(e) => setSendDay(Number(e.target.value))} className={selectCls}>
                      {DOW.map((d, i) => <option key={i} value={i}>{d}</option>)}
                    </select>
                  ) : (
                    <select value={sendDay} onChange={(e) => setSendDay(Number(e.target.value))} className={selectCls}>
                      {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  )}
                </Field>
              )}
              <Field label="Time (UTC)">
                <select value={sendHour} onChange={(e) => setSendHour(Number(e.target.value))} className={selectCls}>
                  {Array.from({ length: 24 }, (_, h) => h).map((h) => (
                    <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
                  ))}
                </select>
              </Field>
              {/* The cadence sets a sensible default window, but the two are
                  separate choices — a daily email of the trailing month is a
                  perfectly reasonable thing to want. */}
              <Field label="Reporting period">
                <select value={period} onChange={(e) => setPeriod(e.target.value)} className={selectCls}>
                  <option value="">Match the frequency</option>
                  {SCHEDULE_PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </Field>
            </div>
            <p className="mt-1.5 text-xs text-ink-500">{periodNote(frequency, period || null)}</p>

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
              <Button onClick={() => save(true)} disabled={busy || blocked}>
                {busy ? "Saving…" : exists ? "Update schedule" : "Schedule delivery"}
              </Button>
              {exists && (
                <Button variant="outline" onClick={() => setEditing(false)} disabled={busy}>
                  Cancel
                </Button>
              )}
            </div>
          </div>
        )}

        <p className="mt-3 text-xs text-ink-500">Reports are generated from the latest synced data and emailed as a branded PDF under your branding. Times are UTC.</p>
      </CardContent>
    </Card>
  );
}

const selectCls = "field h-10 w-full";
const inputCls = selectCls;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-ink-700">{label}</label>
      {children}
    </div>
  );
}
