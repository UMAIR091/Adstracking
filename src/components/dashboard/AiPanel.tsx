import Link from "next/link";
import { Sparkles, TrendingUp, Target, AlertTriangle, PlugZap, ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HelpHint } from "@/components/ui/help-hint";

export type Recommendation = {
  /** "win" | "risk" | "opportunity" — drives tone, not just colour. */
  kind: "win" | "risk" | "opportunity";
  headline: string;
  body: string;
  href?: string;
  cta?: string;
};

const KIND: Record<Recommendation["kind"], { icon: LucideIcon; tint: string; ring: string; label: string }> = {
  win: { icon: TrendingUp, tint: "bg-emerald-50 text-emerald-600", ring: "ring-emerald-100", label: "Win" },
  risk: { icon: AlertTriangle, tint: "bg-rose-50 text-rose-600", ring: "ring-rose-100", label: "Risk" },
  opportunity: { icon: Target, tint: "bg-amber-50 text-amber-600", ring: "ring-amber-100", label: "Opportunity" },
};

/**
 * AI-shaped recommendations, surfaced on the dashboard instead of only inside
 * generated reports.
 *
 * Every card here is derived from the agency's own synced numbers — the same
 * discipline the reports follow. Nothing is canned advice dressed up as
 * analysis, which is why the connect-first state shows no cards at all rather
 * than placeholder wisdom.
 */
export function AiPanel({
  recommendations,
  connected,
}: {
  recommendations: Recommendation[];
  connected: boolean;
}) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles size={16} className="text-brand-500" aria-hidden /> AI insights
          <HelpHint label="About AI insights">
            Written from your clients&apos; real synced numbers — an executive summary, wins, risks and next steps.
            Never generic filler.
          </HelpHint>
        </CardTitle>
        <CardDescription>
          {connected
            ? "What your numbers say right now, and what to do about it."
            : "Plain-English analysis, generated automatically for every report."}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {connected && recommendations.length > 0 ? (
          <>
            <ul className="grid gap-3 sm:grid-cols-3">
              {recommendations.map((r) => {
                const meta = KIND[r.kind];
                const Icon = meta.icon;
                return (
                  <li key={r.headline} className="rounded-xl border border-ink-100 bg-surface-muted/40 p-4">
                    <div className="flex items-center gap-2">
                      <span className={`flex h-7 w-7 items-center justify-center rounded-lg ring-1 ring-inset ${meta.tint} ${meta.ring}`}>
                        <Icon size={14} aria-hidden />
                      </span>
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{meta.label}</span>
                    </div>
                    <p className="mt-2.5 text-sm font-semibold leading-snug text-ink-900">{r.headline}</p>
                    <p className="mt-1 text-xs leading-relaxed text-ink-600">{r.body}</p>
                    {r.href && r.cta && (
                      <Link
                        href={r.href}
                        className="mt-2.5 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:gap-1.5"
                      >
                        {r.cta} <ArrowRight size={12} aria-hidden />
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-xs text-ink-500">
              Full AI analysis — executive summary, wins, risks and recommended actions — is written into every
              generated report.
            </p>
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-ink-200 p-5">
            <p className="text-sm font-medium text-ink-800">Insights unlock after your first sync</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-500">
              Connect a data source and ReportFlow reads that client&apos;s real numbers — then every report you
              generate opens with an AI-written summary, the wins worth reporting, the risks worth flagging, and the
              actions worth taking.
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
