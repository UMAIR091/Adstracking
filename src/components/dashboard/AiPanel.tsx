import Link from "next/link";
import { format, parseISO } from "date-fns";
import { Sparkles, Info, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { HelpHint } from "@/components/ui/help-hint";
import { InsightGrid } from "@/components/insights/InsightCard";
import { NewReportButton } from "@/components/GenerateReportDialog";
import type { Signal } from "@/lib/insights/signals";
import type { ClientAiInsight } from "@/lib/dashboard/aiInsights";

export type AwaitingClient = { id: string; name: string };

function periodText(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;
  const a = parseISO(start);
  const b = parseISO(end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  if (start === end) return format(b, "d MMM yyyy");
  const sameYear = a.getFullYear() === b.getFullYear();
  const sameMonth = sameYear && a.getMonth() === b.getMonth();
  return `${format(a, sameMonth ? "d" : sameYear ? "d MMM" : "d MMM yyyy")}–${format(b, "d MMM yyyy")}`;
}

const MAX_PLATFORMS = 4;

/** One client's AI-written analysis, from its own latest report. */
function AnalysisBlock({ a }: { a: ClientAiInsight }) {
  const period = periodText(a.periodStart, a.periodEnd);
  const shown = a.platforms.slice(0, MAX_PLATFORMS);
  const more = a.platforms.length - shown.length;

  return (
    <li className="flex min-w-0 flex-col rounded-xl border border-ink-100 bg-surface p-4">
      <div className="flex min-w-0 items-baseline justify-between gap-3">
        <Link
          href={`/dashboard/clients/${a.clientId}`}
          className="min-w-0 truncate text-sm font-semibold text-ink-900 hover:text-brand-600 hover:underline"
          title={`Open ${a.clientName}`}
        >
          {a.clientName}
        </Link>
        {period && <span className="shrink-0 text-[11px] tabular-nums text-ink-500">{period}</span>}
      </div>

      {shown.length > 0 && (
        <p className="mt-1.5 flex flex-wrap gap-1" aria-label="Platforms analysed">
          {shown.map((p) => (
            <span key={p} className="rounded-full bg-ink-50 px-2 py-0.5 text-[11px] font-medium text-ink-600 ring-1 ring-inset ring-ink-100">
              {p}
            </span>
          ))}
          {more > 0 && <span className="px-1 py-0.5 text-[11px] text-ink-500">+{more} more</span>}
        </p>
      )}

      <p className="mt-2.5 line-clamp-4 text-[13px] leading-relaxed text-ink-700" title={a.summary}>
        {a.summary}
      </p>

      {a.nextStep && (
        <p className="mt-2.5 line-clamp-3 rounded-lg bg-brand-50 px-3 py-2 text-xs leading-relaxed text-ink-800">
          <span className="font-semibold text-brand-700">Next step: </span>
          {a.nextStep}
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 pt-2.5 text-[11px]">
        <span className="text-ink-500">Written {format(parseISO(a.generatedAt), "d MMM")}</span>
        <span className="flex items-center gap-3">
          <Link href={`/dashboard/clients/${a.clientId}`} className="font-medium text-ink-600 hover:text-ink-900 hover:underline">
            Client<span className="sr-only"> {a.clientName}</span>
          </Link>
          <Link
            href={`/dashboard/reports/${a.reportId}`}
            className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline"
          >
            Full analysis <ArrowRight size={11} aria-hidden />
            <span className="sr-only"> for {a.clientName}</span>
          </Link>
        </span>
      </div>
    </li>
  );
}

/**
 * Home's AI insights, client by client.
 *
 * The written analysis is what the AI system (lib/ai) produced from each
 * client's own synced data when that client's latest report was generated —
 * read back from the report, never re-asked of the model here and never
 * pooled across clients. The signal cards beneath are calculated per client
 * from Search Console. Every block and card names its client, platform and
 * account, and links to that client, so an agency with many clients can't
 * misread whose numbers it is looking at.
 *
 * No sample insights, ever: an empty state says what produces real ones.
 */
export function AiPanel({
  analyses,
  analysedTotal,
  signals,
  awaiting,
  aiOnPlan,
}: {
  analyses: ClientAiInsight[];
  /** Clients with an AI analysis, including any beyond the ones shown. */
  analysedTotal: number;
  signals: Signal[];
  /** Synced clients with no recent AI analysis. */
  awaiting: AwaitingClient[];
  /** Whether this workspace's plan writes AI analysis into new reports. */
  aiOnPlan: boolean;
}) {
  const hidden = Math.max(0, analysedTotal - analyses.length);
  const awaitingShown = awaiting.slice(0, 5);
  const nothingYet = analyses.length === 0 && signals.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles size={16} className="text-brand-500" aria-hidden /> AI insights
          <HelpHint label="How these insights are produced">
            When a report is generated, Anavyst&apos;s AI reads that client&apos;s synced data — and only that
            client&apos;s — and writes the summary and next step shown here. The cards below are calculated directly
            from each client&apos;s Search Console data, with a confidence level based on how much data supports
            them.
          </HelpHint>
        </CardTitle>
        <CardDescription>Written from each client&apos;s own data. Every insight names its client and platform.</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {!aiOnPlan && (
          <p className="flex items-start gap-2 rounded-lg border border-ink-100 bg-ink-50 px-3 py-2.5 text-xs leading-relaxed text-ink-600">
            <Info size={13} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              AI-written analysis is included on the paid plans; your reports still carry all the data.
              {analyses.length > 0 && " The analysis below is from earlier reports."}{" "}
              <Link href="/dashboard/billing" className="font-medium text-brand-600 hover:underline">
                See plans
              </Link>
            </span>
          </p>
        )}

        {analyses.length > 0 && (
          <section aria-label="AI-written analysis by client">
            <ul className="grid gap-3 md:grid-cols-2">
              {analyses.map((a) => (
                <AnalysisBlock key={a.clientId} a={a} />
              ))}
            </ul>
            {hidden > 0 && (
              <p className="mt-2.5 text-xs text-ink-500">
                {hidden} more client{hidden === 1 ? " has" : "s have"} AI analysis on{" "}
                <Link href="/dashboard/reports" className="font-medium text-brand-600 hover:underline">
                  their reports
                </Link>
                .
              </p>
            )}
          </section>
        )}

        {aiOnPlan && awaitingShown.length > 0 && (
          <div className="rounded-lg border border-dashed border-ink-200 px-3.5 py-3">
            <p className="text-xs leading-relaxed text-ink-600">
              {analyses.length > 0 ? "No recent AI analysis for" : "No AI analysis yet for"}{" "}
              {awaiting.length > awaitingShown.length ? `these ${awaiting.length} clients` : "these clients"}. Generate a
              report and the AI writes one from that client&apos;s data.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {awaitingShown.map((c) => (
                <NewReportButton key={c.id} clientId={c.id} size="sm" variant="outline" className="h-7 max-w-full px-2.5 text-xs">
                  <Sparkles size={12} aria-hidden /> <span className="truncate">{c.name}</span>
                </NewReportButton>
              ))}
              {awaiting.length > awaitingShown.length && (
                <span className="self-center px-1 text-xs text-ink-500">+{awaiting.length - awaitingShown.length} more</span>
              )}
            </div>
          </div>
        )}

        {signals.length > 0 && (
          <section aria-label="Calculated signals by client">
            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
              Signals · calculated from Search Console
            </p>
            <InsightGrid signals={signals} twoUp />
          </section>
        )}

        {nothingYet && awaitingShown.length === 0 && (
          <div className="rounded-xl border border-dashed border-ink-200 p-5">
            <p className="text-sm font-medium text-ink-800">No insights yet</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-500">
              {aiOnPlan
                ? "Generate a report and the AI writes a summary and next step from that client's synced data. They appear here, labelled by client."
                : "Signals appear here once a client's Search Console data shows a meaningful change."}
            </p>
            {aiOnPlan && (
              <NewReportButton size="sm" variant="outline" className="mt-4">
                <Sparkles size={14} aria-hidden /> New report
              </NewReportButton>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
