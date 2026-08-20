import { notFound, redirect } from "next/navigation";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { createClient } from "@/lib/supabase/server";
import { ConnectAccountButton } from "@/components/ConnectAccountModal";
import { ClientSection } from "@/components/ClientSection";
import {
  DataHealthPanel, PerformancePanel, ReportingPanel,
  type AttentionSource, type PerformanceGlance,
} from "@/components/ClientOverviewPanels";
import { loadClientWorkspace } from "@/lib/clients/workspace";
import { buildActivity } from "@/lib/dashboard/activity";
import { buildOverview } from "@/lib/integrations/overview";
import { cachedPeriodLabel } from "@/lib/reports/periods";

export const dynamic = "force-dynamic";

// Overview: four questions, one screen.
//
//   1. How is this client performing?      → headline figure per channel
//   2. Is anything broken?                 → source health + what it blocks
//   3. How fresh is the data?              → last completed sync
//   4. What happened most recently?        → the latest reporting event
//
// It deliberately stops there. The old page also carried a stat grid whose
// numbers the panels below now state in context, and a row of cards linking to
// Performance / Reports / Automations — which is exactly what the tab bar
// directly above it does. Both were removed rather than restyled: the fastest
// way to make a summary readable is to have less of it.
//
// Nothing here is calculated by this page. buildOverview is the same function
// that produces the Performance tab's headline row, buildActivity the same one
// behind the dashboard timeline, and the health states come from the workspace
// loader — so Overview can never quote a figure the tab it summarises disagrees
// with. A client with nothing connected says so rather than showing zeros
// dressed as performance.
export default async function ClientOverviewPage({ params }: { params: { id: string } }) {
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

  const [{ count: reportCount }, { data: schedule }, { data: recentReports }, { data: recentEmails }] =
    await Promise.all([
      supabase.from("reports").select("id", { count: "exact", head: true }).eq("client_id", clientId),
      supabase
        .from("report_schedules")
        .select("frequency, enabled, next_run_at")
        .eq("client_id", clientId)
        .maybeSingle(),
      // Only what the latest-activity line needs. A handful, because an email
      // can be newer than the report it delivered.
      supabase
        .from("reports")
        .select("id, title, created_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(5),
      // Same join the Automations tab uses to scope email_logs to one client.
      supabase
        .from("email_logs")
        .select("report_id, to_email, status, sent_at, error, source, reports!inner(client_id)")
        .eq("reports.client_id", clientId)
        .order("sent_at", { ascending: false })
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

  const attention: AttentionSource[] = ws.needingAttention.map((i) => ({ name: i.def.name, health: i.health! }));

  // Reporting activity only: source and client events are answered by the
  // panels beside this one, so replaying them here would just be noise.
  const [latestEvent] = buildActivity(
    {
      clients: [],
      sources: [],
      reports: (recentReports ?? []).map((r) => ({
        id: r.id as string,
        title: r.title as string,
        created_at: r.created_at as string,
        clientName: client.name as string,
      })),
      emails: (recentEmails ?? []) as unknown as {
        report_id: string | null; to_email: string; status: string;
        sent_at: string; error?: string | null; source?: string | null;
      }[],
    },
    1,
  );

  const base = `/dashboard/clients/${clientId}`;
  const scheduled =
    schedule?.enabled && schedule?.next_run_at
      ? { frequency: schedule.frequency as string, nextRunAt: schedule.next_run_at as string }
      : null;

  return (
    <ClientSection
      title="Overview"
      description="Where this client stands, and anything that needs you."
      action={
        <ConnectAccountButton
          clientId={clientId}
          integrations={ws.connectableIntegrations}
          label="Add data source"
        />
      }
    >
      {/* Performance leads and takes the width, because "how is this client
          doing?" is the question the page exists to answer. Health and
          reporting are the supporting rail; they stack beneath on smaller
          screens rather than shrinking. */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PerformancePanel
            glance={glance}
            periodLabel={cachedPeriodLabel(ws.periodDays)}
            performanceHref={`${base}/performance`}
            dataSourcesHref={`${base}/data-sources`}
          />
        </div>

        <div className="space-y-4">
          <DataHealthPanel
            connectedCount={ws.connectedIntegrations.length}
            attention={attention}
            lastSyncedAt={lastSynced ?? null}
            blockedReason={ws.dataBlockedReason}
            dataSourcesHref={`${base}/data-sources`}
          />
          <ReportingPanel
            event={latestEvent ?? null}
            reportCount={reportCount ?? 0}
            schedule={scheduled}
            reportsHref={`${base}/reports`}
            automationsHref={`${base}/automations`}
          />
        </div>
      </div>
    </ClientSection>
  );
}
