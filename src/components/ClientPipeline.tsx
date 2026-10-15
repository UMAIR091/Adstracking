import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { NewReportButton } from "@/components/GenerateReportDialog";
import { cn } from "@/lib/utils";

// A client's reporting pipeline on its Overview: Connect → Sync → Report →
// Deliver, one card each with a ✓ / ! / · state, a one-line fact and the one
// action that moves it forward. Every state is derived from values the
// workspace loader and the overview page already fetch; nothing is estimated.

export type PipelineState = "ok" | "warn" | "idle";

export type PipelineInput = {
  base: string; // /dashboard/clients/{id}
  clientId: string;
  /** Connected sources by name, and how many of them need the user. */
  connected: string[];
  attention: number;
  /** The first problem worth naming, e.g. "GA4: Reconnect required". */
  firstIssue: string | null;
  lastSyncedAt: string | null;
  /** A synced snapshot exists, so a report can be generated now. */
  hasData: boolean;
  dataBlockedReason?: string;
  reportCount: number;
  latestReport: { id: string; title: string; created_at: string } | null;
  schedule: { frequency: string; enabled: boolean; nextRunAt: string | null } | null;
};

type Step = {
  key: string;
  state: PipelineState;
  value: string;
  fact: string;
  action: React.ReactNode;
};

const MARK: Record<PipelineState, { mark: string; dot: string; card: string; label: string }> = {
  ok: { mark: "✓", dot: "bg-success-50 text-success-700", card: "border-ink-100 bg-surface", label: "done" },
  warn: { mark: "!", dot: "bg-danger-50 text-danger-700", card: "border-danger-100 bg-danger-50/30", label: "needs attention" },
  idle: { mark: "·", dot: "bg-ink-100 text-ink-400", card: "border-ink-100 bg-ink-50", label: "not started" },
};

const linkCls = "mt-1 text-[13px] font-medium text-brand-600 hover:text-ink-900";

export function pipelineSteps(p: PipelineInput): Step[] {
  const n = p.connected.length;
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  const connect: Step = {
    key: "Connect",
    state: n === 0 ? "warn" : p.attention > 0 ? "warn" : "ok",
    value: n === 0 ? "Nothing connected" : `${n} data source${n === 1 ? "" : "s"}`,
    fact: n === 0 ? "Add Search Console, GA4 or an ads platform." : p.attention > 0 ? `${p.attention} need${p.attention === 1 ? "s" : ""} attention · ${p.connected.join(", ")}` : p.connected.join(", "),
    action: <Link href={`${p.base}/data-sources`} className={linkCls}>{n === 0 ? "Add data source" : "Manage sources"}</Link>,
  };

  const sync: Step =
    n === 0
      ? { key: "Sync", state: "idle", value: "Not started", fact: "Waiting for a source.", action: <Link href={`${p.base}/data-sources`} className={linkCls}>Add data source</Link> }
      : p.firstIssue
        ? { key: "Sync", state: "warn", value: "Blocked", fact: p.firstIssue, action: <Link href={`${p.base}/data-sources`} className={linkCls}>Fix</Link> }
        : p.lastSyncedAt
          ? {
              key: "Sync",
              state: "ok",
              value: "Up to date",
              fact: `Last synced ${formatDistanceToNow(new Date(p.lastSyncedAt), { addSuffix: true })}`,
              action: <Link href={`${p.base}/data-sources`} className={linkCls}>Manage sources</Link>,
            }
          : { key: "Sync", state: "idle", value: "Waiting", fact: "The first sync usually lands within a few minutes.", action: <Link href={`${p.base}/data-sources`} className={linkCls}>View sources</Link> };

  const report: Step = p.latestReport
    ? {
        key: "Report",
        state: "ok",
        value: p.latestReport.title,
        fact: `${p.reportCount} generated · latest ${format(new Date(p.latestReport.created_at), "d MMM yyyy")}`,
        action: <Link href={`/dashboard/reports/${p.latestReport.id}`} className={linkCls}>Open latest</Link>,
      }
    : {
        key: "Report",
        state: "idle",
        value: "No report yet",
        fact: p.hasData ? "Data has synced — generating one takes a click." : (p.dataBlockedReason ?? "Generate one once data has synced."),
        action: p.hasData ? (
          <NewReportButton clientId={p.clientId} variant="ghost" size="sm" className="-ml-2 mt-1 w-fit px-2 text-[13px] text-brand-600 hover:bg-transparent hover:text-ink-900">
            Generate report
          </NewReportButton>
        ) : (
          <Link href={`${p.base}/data-sources`} className={linkCls}>Connect data</Link>
        ),
      };

  const s = p.schedule;
  const deliver: Step =
    s?.enabled && s.nextRunAt
      ? {
          key: "Deliver",
          state: "ok",
          value: cap(s.frequency),
          fact: `Next: ${format(new Date(s.nextRunAt), "d MMM")}`,
          action: <Link href={`${p.base}/automations`} className={linkCls}>Edit schedule</Link>,
        }
      : s && !s.enabled
        ? { key: "Deliver", state: "idle", value: "Paused", fact: "The schedule is switched off.", action: <Link href={`${p.base}/automations`} className={linkCls}>Edit schedule</Link> }
        : { key: "Deliver", state: "idle", value: "Not scheduled", fact: "Send manually or put it on a schedule.", action: <Link href={`${p.base}/automations`} className={linkCls}>Set up schedule</Link> };

  return [connect, sync, report, deliver];
}

export function ClientPipeline(props: PipelineInput) {
  const steps = pipelineSteps(props);
  return (
    <section aria-labelledby="pipeline-heading" className="rounded-card border border-ink-200 bg-surface p-[18px]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="pipeline-heading" className="text-[15px] font-semibold text-ink-900">Reporting pipeline</h2>
        <span className="text-[12.5px] text-ink-400">From connected data to a delivered report</span>
      </div>
      <ol className="mt-3.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map((st) => {
          const m = MARK[st.state];
          return (
            <li key={st.key} className={cn("flex flex-col gap-1.5 rounded-xl border p-3.5", m.card)}>
              <span className="flex items-center gap-2">
                <span aria-hidden className={cn("flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold", m.dot)}>{m.mark}</span>
                <span className="font-app-mono text-[11px] uppercase tracking-[0.06em] text-ink-400">{st.key}</span>
                <span className="sr-only">: {m.label}</span>
              </span>
              <span className="truncate text-[15px] font-semibold text-ink-900" title={st.value}>{st.value}</span>
              <span className="flex-1 text-[12.5px] leading-snug text-ink-500">{st.fact}</span>
              {st.action}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
