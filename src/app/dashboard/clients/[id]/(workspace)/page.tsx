import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { format } from "date-fns";
import { FileText } from "lucide-react";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { createClient } from "@/lib/supabase/server";
import { PerformancePanel, type PerformanceGlance } from "@/components/ClientOverviewPanels";
import { ClientPipeline } from "@/components/ClientPipeline";
import { StatusChip } from "@/components/ui/status-chip";
import { loadClientWorkspace } from "@/lib/clients/workspace";
import { buildOverview } from "@/lib/integrations/overview";
import { cachedPeriodLabel } from "@/lib/reports/periods";
import { SOURCE_HEALTH } from "@/lib/integrations/status";

export const dynamic = "force-dynamic";

// Overview: where this client stands, in two reads.
//
//   1. The reporting pipeline: connect → sync → report → deliver, each with its
//      state and the one action that moves it on.
//   2. How the client is performing (one headline per channel), beside the
//      latest reports.
//
// Nothing here is calculated by this page. buildOverview is the same function
// that produces the Performance tab's headline row and the health states come
// from the workspace loader, so Overview can never quote a figure the tab it
// summarises disagrees with. A client with nothing connected says so rather
// than showing zeros dressed as performance.
export default async function ClientOverviewPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) redirect("/login");

  const supabase = createClient();
  const { data: client } = await supabase
    .from("clients")
    .select("id, name")
    .eq("id", params.id)
    .maybeSingle();
  if (!client) notFound();

  const clientId = client.id as string;
  const ws = await loadClientWorkspace(supabase, clientId);

  const [{ count: reportCount }, { data: schedule }, { data: recentReports }] = await Promise.all([
    supabase.from("reports").select("id", { count: "exact", head: true }).eq("client_id", clientId),
    supabase.from("report_schedules").select("frequency, enabled, next_run_at").eq("client_id", clientId).maybeSingle(),
    supabase
      .from("reports")
      .select("id, title, status, period_start, period_end, created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  // The freshest completed sync across every connected source.
  const lastSynced = ws.connectedIntegrations
    .map((i) => i.lastSyncedAt)
    .filter((d): d is string => Boolean(d))
    .sort()
    .at(-1);

  const glance: PerformanceGlance =
    ws.vizSources.length > 0
      ? { kind: "data", metrics: buildOverview(ws.performanceSources), sourceCount: ws.vizSources.length }
      : ws.connectedIntegrations.length > 0
        ? { kind: "awaiting", sourceCount: ws.connectedIntegrations.length }
        : { kind: "none" };

  // The first broken source, named, for the Sync step (needs_account is a
  // choice to make, not a failed sync, so it is counted under Connect only).
  const broken = ws.needingAttention.find((i) => i.health === "needs_reconnect" || i.health === "sync_error");
  const reports = (recentReports ?? []) as { id: string; title: string; status: string | null; period_start: string | null; period_end: string | null; created_at: string }[];
  const base = `/dashboard/clients/${clientId}`;

  return (
    <div className="flex flex-col gap-5">
      <ClientPipeline
        base={base}
        clientId={clientId}
        connected={ws.connectedIntegrations.map((i) => i.def.name)}
        attention={ws.needingAttention.length}
        firstIssue={broken ? `${broken.def.name}: ${SOURCE_HEALTH[broken.health!].label}` : null}
        lastSyncedAt={lastSynced ?? null}
        hasData={ws.hasSyncedData}
        dataBlockedReason={ws.dataBlockedReason}
        reportCount={reportCount ?? 0}
        latestReport={reports[0] ? { id: reports[0].id, title: reports[0].title, created_at: reports[0].created_at } : null}
        schedule={schedule ? { frequency: schedule.frequency as string, enabled: !!schedule.enabled, nextRunAt: (schedule.next_run_at as string | null) ?? null } : null}
      />

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <PerformancePanel
          glance={glance}
          periodLabel={cachedPeriodLabel(ws.periodDays)}
          performanceHref={`${base}/performance`}
          dataSourcesHref={`${base}/data-sources`}
        />

        <section aria-labelledby="latest-reports" className="min-w-0 rounded-card border border-ink-200 bg-surface p-[18px]">
          <div className="flex items-baseline justify-between">
            <h2 id="latest-reports" className="text-[15px] font-semibold text-ink-900">Latest reports</h2>
            <Link href={`${base}/reports`} className="text-[13px] font-medium text-brand-600 hover:text-ink-900">All</Link>
          </div>
          {reports.length === 0 ? (
            <p className="mt-3 text-[13.5px] leading-relaxed text-ink-500">
              No reports yet. Once data has synced, generating one takes a single click.
            </p>
          ) : (
            <ul className="mt-1.5">
              {reports.map((r, i) => (
                <li key={r.id} className={i ? "border-t border-ink-100" : ""}>
                  <Link href={`/dashboard/reports/${r.id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-[11px] transition-colors hover:bg-ink-50">
                    <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-ink-500">
                      <FileText size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium text-ink-900">{r.title}</span>
                      <span className="block text-xs text-ink-400">
                        {r.period_start && r.period_end
                          ? `${format(new Date(r.period_start), "d MMM")} – ${format(new Date(r.period_end), "d MMM yyyy")}`
                          : format(new Date(r.created_at), "d MMM yyyy")}
                      </span>
                    </span>
                    <StatusChip tone={r.status === "ready" ? "success" : "muted"} className="capitalize">{r.status ?? "draft"}</StatusChip>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
