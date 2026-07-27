import Link from "next/link";
import { Sparkles, PlugZap, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HelpHint } from "@/components/ui/help-hint";
import { InsightGrid } from "@/components/insights/InsightCard";
import type { Signal } from "@/lib/insights/signals";

/**
 * Workspace-wide AI insights on the dashboard.
 *
 * Every card is derived from a client's own synced rows and tagged with which
 * client it belongs to, so the panel answers "where do I need to look today?"
 * across the whole roster — the question a dashboard should answer, and the one
 * a per-client report can't.
 *
 * The connect-first state shows no cards rather than sample ones. Placeholder
 * insights would teach users to distrust the real ones.
 */
export function AiPanel({ signals, connected }: { signals: Signal[]; connected: boolean }) {
  const hasSignals = connected && signals.length > 0;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles size={16} className="text-brand-500" aria-hidden /> AI insights
          <HelpHint label="How these insights are produced">
            Each card is calculated from your clients&apos; synced Search Console and Analytics data — winners,
            declines, spikes and opportunities — with a confidence level based on how much data supports it. Full
            AI-written analysis appears on every report.
          </HelpHint>
        </CardTitle>
        <CardDescription>
          {hasSignals
            ? "What changed across your clients, and how much to trust it."
            : "Plain-English analysis, generated automatically for every report."}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {hasSignals ? (
          <>
            <InsightGrid signals={signals} />
            <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-500">
              <Info size={12} className="mt-0.5 shrink-0" aria-hidden />
              Calculated from your own data — nothing here is estimated. Open a report for the full AI-written
              summary, wins, risks and recommended actions.
            </p>
          </>
        ) : connected ? (
          // Connected and synced, but nothing crossed a reporting threshold.
          // Saying so plainly beats manufacturing an insight to fill the space.
          <div className="rounded-xl border border-dashed border-ink-200 p-5">
            <p className="text-sm font-medium text-ink-800">Nothing significant to flag yet</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-500">
              Your data is syncing, but nothing has moved enough to call a trend. Insights appear here as soon as a
              keyword, page or traffic pattern changes meaningfully — usually after a couple of weeks of history.
            </p>
            <Button asChild size="sm" variant="outline" className="mt-4">
              <Link href="/dashboard/clients">View clients</Link>
            </Button>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-ink-200 p-5">
            <p className="text-sm font-medium text-ink-800">Insights unlock after your first sync</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-500">
              Connect a data source and ReportFlow reads that client&apos;s real numbers — then every report opens
              with an AI-written summary, the wins worth reporting, the risks worth flagging, and the actions worth
              taking.
            </p>
            <Button asChild size="sm" variant="outline" className="mt-4">
              <Link href="/dashboard/clients">
                <PlugZap size={15} aria-hidden /> Connect a data source
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
