import Link from "next/link";
import { redirect } from "next/navigation";
import { Search, BarChart3, Megaphone, CheckCircle2, Users } from "lucide-react";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";

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
  const gscConnected = list.filter((c) => ((c.data_sources as { type: string }[] | null) ?? []).some((d) => d.type === "gsc")).length;

  const providers = [
    { key: "gsc", name: "Google Search Console", desc: "Clicks, impressions, queries & pages", icon: Search, tint: "bg-emerald-50 text-emerald-600", status: "available" as const, connected: gscConnected },
    { key: "ga4", name: "Google Analytics 4", desc: "Traffic, engagement & conversions", icon: BarChart3, tint: "bg-amber-50 text-amber-600", status: "soon" as const, connected: 0 },
    { key: "ads", name: "Google Ads", desc: "Spend, clicks, conversions & ROAS", icon: Megaphone, tint: "bg-sky-50 text-sky-600", status: "soon" as const, connected: 0 },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Integrations</h1>
        <p className="text-sm text-ink-500">Connect the data sources that power your client reports.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {providers.map((p) => {
          const Icon = p.icon;
          return (
            <Card key={p.key} className="transition-all hover:-translate-y-0.5 hover:shadow-md">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${p.tint}`}>
                    <Icon size={20} />
                  </div>
                  {p.status === "available" ? (
                    <Badge variant="success"><CheckCircle2 size={12} className="mr-1" /> Available</Badge>
                  ) : (
                    <Badge variant="muted">Coming soon</Badge>
                  )}
                </div>
                <p className="mt-4 font-semibold text-ink-900">{p.name}</p>
                <p className="mt-0.5 text-sm text-ink-500">{p.desc}</p>
                <p className="mt-3 text-xs text-ink-400">
                  {p.status === "available" ? `Connected for ${p.connected} client${p.connected === 1 ? "" : "s"}` : "Available in an upcoming release"}
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
            description="Integrations are connected per client. Add a client, then connect Google Search Console."
            action={<Button asChild><Link href="/dashboard/clients/new">Add a client</Link></Button>}
          />
        ) : (
          <div className="space-y-3">
            {list.map((c) => {
              const gsc = ((c.data_sources as { type: string }[] | null) ?? []).some((d) => d.type === "gsc");
              return (
                <Card key={c.id}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                      <p className="font-medium text-ink-900">{c.name}</p>
                      <div className="mt-0.5">
                        {gsc ? <Badge variant="success"><CheckCircle2 size={12} className="mr-1" /> Search Console</Badge> : <Badge variant="muted">Not connected</Badge>}
                      </div>
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/dashboard/clients/${c.id}`}>{gsc ? "Manage" : "Connect"}</Link>
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
