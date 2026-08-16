import Link from "next/link";
import { redirect } from "next/navigation";
import { Users, Plug } from "lucide-react";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { IntegrationSearch } from "@/components/IntegrationSearch";
import { ConnectedAccountsTable, type ConnectedAccountRow } from "@/components/ConnectedAccountsTable";
import type { DataSourceCardData } from "@/components/DataSourceCard";
import { listIntegrations, isConnectable } from "@/lib/integrations/registry";
import { getIntegrationName } from "@/lib/integrations/names";
import { sourceHealth } from "@/lib/integrations/status";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const { user } = await getCurrentUserAndAgency();
  if (!user) redirect("/login");

  const supabase = createClient();

  const { data: clientRows } = await supabase
    .from("clients")
    .select("id, name")
    .eq("archived", false)
    .order("name");
  const clients = clientRows ?? [];

  // Every connection across the agency's active clients, with the fields the
  // Connected Accounts table needs. One query — no per-client fan-out.
  type DsRow = {
    id: string; type: string; display_name: string | null;
    config: Record<string, unknown> | null; status: string | null;
    last_synced_at: string | null; last_sync_error: string | null; client_id: string;
  };
  const clientNameById = new Map(clients.map((c) => [c.id as string, c.name as string]));
  const { data: dsRows } = clients.length
    ? await supabase
        .from("data_sources")
        .select("id, type, display_name, config, status, last_synced_at, last_sync_error, client_id")
        .in("client_id", clients.map((c) => c.id))
    : { data: [] as DsRow[] };
  const sources = (dsRows ?? []) as DsRow[];

  const integrations = listIntegrations();
  const defById = new Map(integrations.map((d) => [d.id, d]));

  // Connecting happens on a client's page. Single-client agencies go straight
  // there; everyone else to the picker (or to create their first client).
  const connectHref =
    clients.length === 0 ? "/dashboard/clients/new" : clients.length === 1 ? `/dashboard/clients/${clients[0].id}` : "/dashboard/clients";

  const connectedCount = (typeId: string) => sources.filter((s) => s.type === typeId).length;

  // ── Available: only what a user can genuinely start connecting today. ──
  // isConnectable, not effectiveStatus, so this list can never offer a Connect
  // button for something the client page treats as unconnectable.
  const available: DataSourceCardData[] = integrations
    .filter(isConnectable)
    .map((def) => ({
      id: def.id,
      name: def.name,
      description: def.description,
      icon: def.icon,
      accent: def.accent,
      status: "live" as const,
      connectedCount: connectedCount(def.id),
      connectHref,
    }));

  // Genuinely not connectable yet — kept visible as a roadmap, clearly apart
  // from the connectable set above.
  const upcoming = integrations.filter((def) => !isConnectable(def));

  // ── Connected accounts, newest-looking issues first. ──
  const accountRows: ConnectedAccountRow[] = sources
    .map((s) => {
      const def = defById.get(s.type);
      const config = (s.config ?? {}) as Record<string, unknown>;
      const accounts = def?.readAccounts?.(config) ?? [];
      const selectedId = def?.readSelected?.(config) ?? null;
      return {
        dataSourceId: s.id,
        integrationId: s.type,
        platform: def?.name ?? getIntegrationName(s.type),
        icon: def?.icon ?? "Plug",
        accent: def?.accent ?? "ink",
        accountLabel: accounts.find((a) => a.id === selectedId)?.name ?? s.display_name ?? null,
        // Shared classifier (P0-1) rather than this page's own rule, which
        // only flagged a missing account when the provider had already fetched
        // its account list — so Instagram and Pinterest read as plain "Connected".
        health: sourceHealth({ status: s.status, lastSyncError: s.last_sync_error, selectedAccountId: selectedId }),
        clientId: s.client_id,
        clientName: clientNameById.get(s.client_id) ?? "Unknown client",
        status: s.status,
        lastSyncedAt: s.last_synced_at,
        lastSyncError: s.last_sync_error,
      };
    })
    // Surface anything needing attention at the top of the table.
    .sort((a, b) => {
      const weight = (r: ConnectedAccountRow) =>
        r.health === "needs_reconnect" ? 0 : r.health === "sync_error" ? 1 : r.health === "needs_account" ? 2 : 3;
      return weight(a) - weight(b) || a.clientName.localeCompare(b.clientName) || a.platform.localeCompare(b.platform);
    });

  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Integrations</h1>
        <p className="text-sm text-ink-500">Connect the data sources that power your client reports.</p>
      </div>

      {/* ── Available integrations ── */}
      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-ink-900">Available integrations</h2>
            <p className="mt-0.5 text-sm text-ink-500">Ready to connect to any of your clients.</p>
          </div>
          <span className="text-xs text-ink-500">{available.length} available</span>
        </div>
        <IntegrationSearch integrations={available} />
      </section>

      {/* ── Connected accounts ── */}
      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-ink-900">Connected accounts</h2>
            <p className="mt-0.5 text-sm text-ink-500">Every account connected across your clients.</p>
          </div>
          {accountRows.length > 0 && (
            <span className="text-xs text-ink-500">
              {accountRows.length} connection{accountRows.length === 1 ? "" : "s"} · {clients.length} client{clients.length === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {clients.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Add a client first"
            description="Integrations are connected per client. Add a client, then connect a data source."
            action={<Button asChild><Link href="/dashboard/clients/new">Add a client</Link></Button>}
          />
        ) : accountRows.length === 0 ? (
          <EmptyState
            icon={Plug}
            title="No accounts connected yet"
            description="Pick an integration above and connect it to one of your clients — its data appears here once linked."
            action={<Button asChild><Link href={connectHref}>Connect a data source</Link></Button>}
          />
        ) : (
          <ConnectedAccountsTable rows={accountRows} />
        )}
      </section>

      {/* ── Roadmap: genuinely not connectable yet ── */}
      {upcoming.length > 0 && (
        <section>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-ink-900">Coming soon</h2>
              <p className="mt-0.5 text-sm text-ink-500">Built and on the way — not yet available to connect.</p>
            </div>
            <span className="text-xs text-ink-500">{upcoming.length} in progress</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {upcoming.map((def) => (
              <Badge key={def.id} variant="muted">{def.name}</Badge>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
