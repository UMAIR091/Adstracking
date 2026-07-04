import Link from "next/link";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { DataSourceCard } from "@/components/DataSourceCard";
import { listIntegrations, liveIntegrations } from "@/lib/integrations/registry";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const { user } = await getCurrentUserAndAgency();
  if (!user) redirect("/login");

  const supabase = createClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, data_sources(type)")
    .eq("archived", false)
    .order("name");

  const list = clients ?? [];
  const integrations = listIntegrations();
  const live = liveIntegrations();
  const connectedCount = (typeId: string) =>
    list.filter((c) => ((c.data_sources as { type: string }[] | null) ?? []).some((d) => d.type === typeId)).length;

  // Connecting a source happens on a client's page. Send single-client agencies
  // straight there; otherwise to the client picker (or to create the first one).
  const connectHref =
    list.length === 0 ? "/dashboard/clients/new" : list.length === 1 ? `/dashboard/clients/${list[0].id}` : "/dashboard/clients";

  const liveCount = integrations.filter((d) => d.status === "live").length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Integrations</h1>
        <p className="text-sm text-ink-500">Connect the data sources that power your client reports.</p>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-ink-700">Data sources</h2>
          <span className="text-xs text-ink-400">{liveCount} available · {integrations.length - liveCount} coming soon</span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {integrations.map((def) => (
            <DataSourceCard
              key={def.id}
              data={{
                id: def.id,
                name: def.name,
                description: def.description,
                icon: def.icon,
                accent: def.accent,
                status: def.status,
                connectedCount: def.status === "live" ? connectedCount(def.id) : 0,
                connectHref,
              }}
            />
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-ink-700">Connection status by client</h2>
        {list.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Add a client first"
            description="Integrations are connected per client. Add a client, then connect a data source."
            action={<Button asChild><Link href="/dashboard/clients/new">Add a client</Link></Button>}
          />
        ) : (
          <div className="space-y-3">
            {list.map((c) => {
              const types = new Set(((c.data_sources as { type: string }[] | null) ?? []).map((d) => d.type));
              const connected = live.filter((d) => types.has(d.id));
              return (
                <Card key={c.id}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="font-medium text-ink-900">{c.name}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {connected.length ? (
                          connected.map((d) => <Badge key={d.id} variant="success" dot>{d.name}</Badge>)
                        ) : (
                          <Badge variant="muted">Not connected</Badge>
                        )}
                      </div>
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/dashboard/clients/${c.id}`}>{connected.length ? "Manage" : "Connect"}</Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
