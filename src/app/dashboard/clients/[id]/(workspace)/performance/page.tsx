import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ClientSection } from "@/components/ClientSection";
import { ClientPerformance } from "@/components/ClientPerformance";
import { ConnectAccountButton } from "@/components/ConnectAccountModal";
import { SyncStatusPoller } from "@/components/SyncStatusPoller";
import { loadClientWorkspace } from "@/lib/clients/workspace";

export const dynamic = "force-dynamic";

// Performance — the section that used to lead the client page, unchanged.
//
// Rendered only from a real synced snapshot; a connected source with no data
// yet gets the awaiting-sync state, and a client with nothing connected gets a
// first-run prompt. Nothing here is ever fabricated. The only difference from
// before is that "connect a data source" now points at the Data sources tab
// rather than an anchor further down the same page.
export default async function ClientPerformancePage({ params }: { params: { id: string } }) {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) redirect("/login");

  const supabase = createClient();
  const { data: client } = await supabase.from("clients").select("id").eq("id", params.id).maybeSingle();
  if (!client) notFound();

  const ws = await loadClientWorkspace(supabase, client.id as string);
  const connect = (
    <ConnectAccountButton clientId={client.id as string} integrations={ws.connectableIntegrations} />
  );

  if (ws.vizSources.length > 0) {
    return (
      <ClientSection
        title="Performance"
        description="Live metrics from every connected source, for the last 28 days."
        action={connect}
      >
        <ClientPerformance sources={ws.performanceSources} />
      </ClientSection>
    );
  }

  if (ws.connectedIntegrations.length > 0) {
    return (
      <ClientSection
        title="Performance"
        description="Your first sync is on its way — metrics appear here as soon as it lands."
        action={connect}
      >
        <SyncStatusPoller
          clientId={client.id as string}
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
      <div className="rounded-xl border border-dashed border-ink-300 bg-surface-subtle px-6 py-12 text-center">
        <p className="text-sm font-medium text-ink-800">No performance data yet</p>
        <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-ink-500">
          Connect Search Console, GA4, Meta Ads or any other source. ReportFlow syncs the data and builds this
          client&apos;s dashboard for you.
        </p>
        <Button asChild className="mt-5">
          <Link href={`/dashboard/clients/${client.id}/data-sources`}>Connect a data source</Link>
        </Button>
      </div>
    </ClientSection>
  );
}
