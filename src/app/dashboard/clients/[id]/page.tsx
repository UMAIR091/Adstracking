import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Eye } from "lucide-react";
import { ConnectStatusToast } from "@/components/ConnectStatusToast";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { IntegrationCard, type IntegrationSource } from "@/components/IntegrationCard";
import { GscAnalytics, type GscReportData } from "@/components/GscAnalytics";
import { Ga4Analytics, type Ga4ReportData } from "@/components/Ga4Analytics";
import { SocialAnalytics } from "@/components/SocialAnalytics";
import { AdsAnalytics, type AdsReportData } from "@/components/AdsAnalytics";
import type { SocialReport } from "@/lib/integrations/social";
import { SAMPLE_GSC, SAMPLE_GA4, SAMPLE_INSTAGRAM } from "@/lib/sampleData";
import { GenerateReport } from "@/components/GenerateReport";
import { ReportSchedule, type ScheduleData } from "@/components/ReportSchedule";
import { DeliveryHistory, type DeliveryLog } from "@/components/DeliveryHistory";
import { liveIntegrations, descriptor } from "@/lib/integrations/registry";

export const dynamic = "force-dynamic";

// Providers that have a dedicated analytics visualization on this page. Others
// (e.g. Meta Ads) are connectable + synced, with their dashboards to follow.
// Sources with a dashboard block. The core trio also shows labelled sample
// data before connecting; the rest render once a synced snapshot exists.
const HAS_VIZ = new Set(["gsc", "ga4", "instagram", "google_ads", "meta_ads", "linkedin_ads", "tiktok_ads"]);
const SAMPLE_VIZ = new Set(["gsc", "ga4", "instagram"]);
const ADS_VIZ = new Set(["google_ads", "meta_ads", "linkedin_ads", "tiktok_ads"]);

// Provider-specific analytics view (the only part that isn't generic, since each
// source visualizes different metrics). Everything else flows from the registry.
// Social platforms share SocialAnalytics; paid-media platforms share AdsAnalytics.
function Analytics({ id, snapshot }: { id: string; snapshot: unknown }) {
  if (id === "gsc") return snapshot ? <GscAnalytics report={snapshot as GscReportData} /> : <GscAnalytics report={SAMPLE_GSC} sample />;
  if (id === "ga4") return snapshot ? <Ga4Analytics report={snapshot as Ga4ReportData} /> : <Ga4Analytics report={SAMPLE_GA4} sample />;
  if (id === "instagram") return snapshot ? <SocialAnalytics report={snapshot as SocialReport} /> : <SocialAnalytics report={SAMPLE_INSTAGRAM} sample />;
  if (ADS_VIZ.has(id) && snapshot) return <AdsAnalytics report={snapshot as AdsReportData} />;
  return null;
}

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) redirect("/login");

  const supabase = createClient();
  const { data: client } = await supabase
    .from("clients")
    .select("id, name, website, email")
    .eq("id", params.id)
    .maybeSingle();
  if (!client) notFound();

  // Load every live integration's connection + cached 28-day snapshot generically
  // from the registry. Never select token columns into the page.
  const integrations = await Promise.all(
    liveIntegrations().map(async (def) => {
      const { data: ds } = await supabase
        .from("data_sources")
        .select("id, display_name, config, last_synced_at, last_sync_error")
        .eq("client_id", client.id)
        .eq("type", def.id)
        .maybeSingle();

      let snapshot: unknown = null;
      if (ds?.id && def.snapshotTable) {
        const { data: snap } = await supabase
          .from(def.snapshotTable)
          .select("data")
          .eq("data_source_id", ds.id)
          .eq("period_days", 28)
          .maybeSingle();
        snapshot = snap?.data ?? null;
      }

      const config = (ds?.config as Record<string, unknown> | null) ?? {};
      const source: IntegrationSource = ds
        ? {
            id: ds.id as string,
            display_name: (ds.display_name as string | null) ?? null,
            accounts: def.readAccounts?.(config) ?? [],
            selectedAccountId: def.readSelected?.(config) ?? null,
          }
        : null;

      return {
        def,
        source,
        snapshot,
        lastSyncedAt: (ds?.last_synced_at as string | null) ?? null,
        lastSyncError: (ds?.last_sync_error as string | null) ?? null,
        ready: Boolean(source?.selectedAccountId),
      };
    })
  );

  const anyReady = integrations.some((i) => i.ready);

  const { data: schedule } = await supabase
    .from("report_schedules")
    .select("frequency, recipients, enabled, next_run_at, send_day, send_hour, subject, message")
    .eq("client_id", client.id)
    .maybeSingle();

  const { data: deliveryLogs } = await supabase
    .from("email_logs")
    .select("id, to_email, subject, status, sent_at, attempts, error, reports!inner(client_id)")
    .eq("reports.client_id", client.id)
    .order("sent_at", { ascending: false })
    .limit(8);

  return (
    <div>
      <Suspense fallback={null}>
        <ConnectStatusToast />
      </Suspense>
      <Link href="/dashboard/clients" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-700">
        <ArrowLeft size={15} /> Back to clients
      </Link>
      <div className="mb-6 mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{client.name}</h1>
          <p className="text-sm text-ink-500">{client.website || client.email || "—"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/reports/preview"><Eye size={16} /> Preview report</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/dashboard/clients/${client.id}/edit`}>Edit client</Link>
          </Button>
        </div>
      </div>

      <h2 className="mb-3 text-sm font-medium text-ink-700">Data sources</h2>
      <div className="space-y-3">
        {integrations.map((i) => (
          <IntegrationCard
            key={i.def.id}
            descriptor={descriptor(i.def)}
            clientId={client.id}
            source={i.source}
            lastSyncedAt={i.lastSyncedAt}
            lastSyncError={i.lastSyncError}
          />
        ))}
        <Link
          href="/dashboard/integrations"
          className="block rounded-xl border border-dashed border-ink-300 bg-surface-subtle p-5 text-sm text-ink-500 transition-colors hover:border-ink-400 hover:text-ink-700"
        >
          More sources — Google Ads, Meta Ads, LinkedIn Ads and more — are on the way. See all integrations →
        </Link>
      </div>

      {/* Performance — real cached metrics, or a sample placeholder until connected. */}
      {integrations.filter((i) => HAS_VIZ.has(i.def.id) && (SAMPLE_VIZ.has(i.def.id) || i.snapshot)).map((i) => (
        <div key={i.def.id} className="mt-8">
          <h2 className="mb-3 text-sm font-medium text-ink-700">{i.def.name}</h2>
          <Analytics id={i.def.id} snapshot={i.snapshot} />
        </div>
      ))}

      <div className="mt-8">
        <GenerateReport clientId={client.id} ready={anyReady} />
      </div>

      <div className="mt-4 space-y-4">
        <ReportSchedule
          clientId={client.id}
          clientEmail={(client.email as string | null) ?? null}
          schedule={(schedule as unknown as ScheduleData) ?? null}
        />
        <DeliveryHistory logs={(deliveryLogs as unknown as DeliveryLog[]) ?? []} />
      </div>
    </div>
  );
}
