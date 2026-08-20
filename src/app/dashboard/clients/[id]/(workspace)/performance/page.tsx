import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ClientSection } from "@/components/ClientSection";
import { ClientPerformance, type PerformancePeriodOption } from "@/components/ClientPerformance";
import { ConnectAccountButton } from "@/components/ConnectAccountModal";
import { SyncStatusPoller } from "@/components/SyncStatusPoller";
import { loadClientWorkspace } from "@/lib/clients/workspace";
import { CACHED_PERIOD_DAYS, cachedPeriodLabel, isCachedPeriodDays, type CachedPeriodDays } from "@/lib/reports/periods";

export const dynamic = "force-dynamic";

// Performance — every chart and metric this client has, under one set of
// controls.
//
// Rendered only from a real synced snapshot; a connected source with no data
// yet gets the awaiting-sync state, and a client with nothing connected gets a
// first-run prompt. Nothing here is ever fabricated.
//
// The period control switches which CACHED window is read — every sync stores a
// 28-day and a 90-day snapshot per source, so both are real stored data. No
// figure is derived, re-fetched or estimated for it; `?period=` simply selects
// which of the two existing rows the page loads.
export default async function ClientPerformancePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { period?: string };
}) {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) redirect("/login");

  const supabase = createClient();
  const { data: client } = await supabase.from("clients").select("id").eq("id", params.id).maybeSingle();
  if (!client) notFound();

  // Anything unrecognised falls back to the default window rather than erroring
  // — a hand-edited URL should never break the page.
  const periodDays: CachedPeriodDays = isCachedPeriodDays(searchParams?.period)
    ? (Number(searchParams?.period) as CachedPeriodDays)
    : 28;

  const ws = await loadClientWorkspace(supabase, client.id as string, periodDays);
  const clientId = client.id as string;
  const base = `/dashboard/clients/${clientId}/performance`;

  const periods: PerformancePeriodOption[] = CACHED_PERIOD_DAYS.map((d) => ({
    days: d,
    label: cachedPeriodLabel(d),
    // The default window keeps a clean URL, so the tab link and this control
    // resolve to the same address.
    href: d === 28 ? base : `${base}?period=${d}`,
    active: d === periodDays,
  }));
  const periodLabel = cachedPeriodLabel(periodDays);

  // The freshest sync across this client's sources — "as of when" belongs with
  // the numbers, not in a card of its own.
  const lastSynced = ws.connectedIntegrations
    .map((i) => i.lastSyncedAt)
    .filter((d): d is string => Boolean(d))
    .sort()
    .at(-1);

  const connect = <ConnectAccountButton clientId={clientId} integrations={ws.connectableIntegrations} />;

  if (ws.vizSources.length > 0) {
    return (
      <ClientSection
        title="Performance"
        description={`${periodLabel} across ${ws.vizSources.length} source${ws.vizSources.length === 1 ? "" : "s"}${
          lastSynced ? ` · synced ${formatDistanceToNow(new Date(lastSynced), { addSuffix: true })}` : ""
        }`}
        action={connect}
      >
        <ClientPerformance sources={ws.performanceSources} periods={periods} periodLabel={periodLabel} />
      </ClientSection>
    );
  }

  if (ws.connectedIntegrations.length > 0) {
    // A window with no cached row is its own state: the client may well have
    // data for the other window, so say which one is missing rather than
    // claiming nothing has synced.
    if (periodDays !== 28) {
      return (
        <ClientSection
          title="Performance"
          description={`No ${periodDays}-day snapshot is cached for this client yet.`}
          action={connect}
        >
          <div className="rounded-xl border border-dashed border-ink-200 bg-surface-subtle px-6 py-12 text-center">
            <p className="text-sm font-medium text-ink-800">Nothing stored for the last {periodDays} days</p>
            <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-ink-500">
              Each sync caches a 28-day and a {periodDays}-day window. This client&apos;s {periodDays}-day window
              hasn&apos;t landed yet — the shorter one may already have.
            </p>
            <Button asChild variant="outline" className="mt-5">
              <Link href={base}>Show last 28 days</Link>
            </Button>
          </div>
        </ClientSection>
      );
    }

    return (
      <ClientSection
        title="Performance"
        description="Your first sync is on its way — metrics appear here as soon as it lands."
        action={connect}
      >
        <SyncStatusPoller
          clientId={clientId}
          sourceCount={ws.connectedIntegrations.length}
          initialFailing={ws.connectedIntegrations.filter((i) => i.lastSyncError).length}
        />
      </ClientSection>
    );
  }

  return (
    <ClientSection
      title="Performance"
      description="Connect a source and this client's metrics appear here automatically."
      action={connect}
    >
      <div className="rounded-xl border border-dashed border-ink-200 bg-surface-subtle px-6 py-12 text-center">
        <p className="text-sm font-medium text-ink-800">No performance data yet</p>
        <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-ink-500">
          Connect Search Console, GA4, Meta Ads or any other source. ReportFlow syncs the data and builds this
          client&apos;s dashboard for you.
        </p>
        <Button asChild className="mt-5">
          <Link href={`/dashboard/clients/${clientId}/data-sources`}>Connect a data source</Link>
        </Button>
      </div>
    </ClientSection>
  );
}
