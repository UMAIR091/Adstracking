import Link from "next/link";
import { redirect } from "next/navigation";
import { Users, Search, BarChart3, Megaphone, MapPin, Facebook, Linkedin, Music, Plug } from "lucide-react";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { listIntegrations, liveIntegrations } from "@/lib/integrations/registry";

export const dynamic = "force-dynamic";

const ICONS: Record<string, typeof Search> = { Search, BarChart3, Megaphone, MapPin, Facebook, Linkedin, Music };
const TINTS: Record<string, string> = {
  emerald: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  sky: "bg-sky-50 text-sky-600",
  rose: "bg-rose-50 text-rose-600",
  blue: "bg-blue-50 text-blue-600",
  cyan: "bg-cyan-50 text-cyan-600",
  fuchsia: "bg-fuchsia-50 text-fuchsia-600",
};

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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Integrations</h1>
        <p className="text-sm text-ink-500">Connect the data sources that power your client reports.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {integrations.map((def) => {
          const Icon = ICONS[def.icon] ?? Plug;
          const tint = TINTS[def.accent] ?? "bg-ink-100 text-ink-600";
          const connected = def.status === "live" ? connectedCount(def.id) : 0;
          return (
            <Card key={def.id} className="transition-all hover:-translate-y-0.5 hover:shadow-md">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${tint}`}>
                    <Icon size={20} />
                  </div>
                  {def.status === "live" ? (
                    <Badge variant="success" dot>Available</Badge>
                  ) : (
                    <Badge variant="muted">Coming soon</Badge>
                  )}
                </div>
                <p className="mt-4 font-semibold text-ink-900">{def.name}</p>
                <p className="mt-0.5 text-sm text-ink-500">{def.description}</p>
                <p className="mt-3 text-xs text-ink-400">
                  {def.status === "live"
                    ? `Connected for ${connected} client${connected === 1 ? "" : "s"}`
                    : "Available in an upcoming release"}
                </p>
              </CardContent>
            </Card>
          );
        })}
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
