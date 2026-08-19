import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ClientSection } from "@/components/ClientSection";
import { IntegrationCard } from "@/components/IntegrationCard";
import { BigQueryCard } from "@/components/BigQueryCard";
import { ConnectAccountButton } from "@/components/ConnectAccountModal";
import { loadClientWorkspace } from "@/lib/clients/workspace";
import { descriptor } from "@/lib/integrations/registry";
import { SOURCE_HEALTH } from "@/lib/integrations/status";

export const dynamic = "force-dynamic";

// Data sources — the section as it was, on its own tab.
//
// Only CONNECTED sources render here; discovery lives in the "Add data source"
// modal, exactly as before. Cards are ordered with anything unhealthy first,
// and the same attention banner names them up front.
export default async function ClientDataSourcesPage({ params }: { params: { id: string } }) {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) redirect("/login");

  const supabase = createClient();
  const { data: client } = await supabase.from("clients").select("id").eq("id", params.id).maybeSingle();
  if (!client) notFound();

  const ws = await loadClientWorkspace(supabase, client.id as string);
  const clientId = client.id as string;

  return (
    <ClientSection
      title="Data sources"
      description={
        ws.connectedIntegrations.length === 0
          ? "Connect a platform to start pulling this client's data."
          : `${ws.connectedIntegrations.length} connected${ws.needingAttention.length > 0 ? ` · ${ws.needingAttention.length} need attention` : ""}.`
      }
      action={
        <ConnectAccountButton clientId={clientId} integrations={ws.connectableIntegrations} label="Add data source" />
      }
    >
      {ws.connectedIntegrations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink-300 bg-surface-subtle px-6 py-12 text-center">
          <p className="text-sm font-medium text-ink-800">No data sources connected yet</p>
          <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-ink-500">
            Connect this client&apos;s Search Console, GA4, Meta Ads or any of the other platforms. ReportFlow syncs
            the data automatically and builds their reports from it.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <ConnectAccountButton
              clientId={clientId}
              integrations={ws.connectableIntegrations}
              label="Add data source"
              variant="default"
            />
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/integrations">Browse all integrations</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Anything needing action is named up front, then the cards
              themselves lead with those same sources. */}
          {ws.needingAttention.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
              <span className="font-semibold">
                {ws.needingAttention.length} source{ws.needingAttention.length === 1 ? "" : "s"} need attention:
              </span>{" "}
              {ws.needingAttention.map((i, n) => (
                <span key={i.def.id}>
                  {n > 0 && ", "}
                  {i.def.name} ({SOURCE_HEALTH[i.health!].short.toLowerCase()})
                </span>
              ))}
            </div>
          )}

          {ws.sortedConnected.map((i) =>
            i.def.id === "bigquery" ? (
              <BigQueryCard
                key={i.def.id}
                descriptor={descriptor(i.def)}
                clientId={clientId}
                source={i.source}
                selectedDatasetId={i.selectedDatasetId}
                selectedTableId={i.selectedTableId}
                status={i.status}
                lastSyncedAt={i.lastSyncedAt}
                lastSyncError={i.lastSyncError}
              />
            ) : (
              <IntegrationCard
                key={i.def.id}
                descriptor={descriptor(i.def)}
                clientId={clientId}
                source={i.source}
                status={i.status}
                lastSyncedAt={i.lastSyncedAt}
                lastSyncError={i.lastSyncError}
              />
            ),
          )}
        </div>
      )}
    </ClientSection>
  );
}
