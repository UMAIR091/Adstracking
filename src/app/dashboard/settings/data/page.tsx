import Link from "next/link";
import { redirect } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Database, ShieldCheck, Plug } from "lucide-react";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { createClient } from "@/lib/supabase/server";
import { getIntegration } from "@/lib/integrations/registry";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { DisconnectSource } from "@/components/DisconnectSource";
import { COMPANY, DATA_PROMISE } from "@/lib/company";

export const dynamic = "force-dynamic";

// Data & privacy: every connected integration across all clients, with a
// disconnect-and-delete action, plus account-deletion contact. This is the
// user-facing data-control page referenced from the legal pages.
export default async function DataPrivacyPage() {
  const { user } = await getCurrentUserAndAgency();
  if (!user) redirect("/login");

  const supabase = createClient();
  const { data: sources } = await supabase
    .from("data_sources")
    .select("id, type, display_name, created_at, last_synced_at, clients(name)")
    .order("created_at", { ascending: false });

  const list = sources ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Data &amp; privacy</h1>
        <p className="mt-1 text-sm text-ink-500">
          Manage every connection {COMPANY.product} has to your clients&apos; data — and remove them at any time.
        </p>
      </div>

      <Card>
        <CardContent className="flex items-start gap-3 p-5">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-emerald-600" />
          <p className="text-sm leading-relaxed text-ink-600">
            {DATA_PROMISE} Disconnecting a source below immediately deletes its stored connection tokens and all
            cached metric data. Read the full details in our{" "}
            <Link href="/privacy" className="font-medium text-brand-600 hover:underline">Privacy Policy</Link> and{" "}
            <Link href="/security" className="font-medium text-brand-600 hover:underline">Data &amp; Security</Link> pages.
          </p>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-sm font-medium text-ink-700">Connected data sources</h2>
        {list.length === 0 ? (
          <EmptyState
            icon={Plug}
            title="No data sources connected"
            description="When you connect integrations for your clients, they'll appear here so you can manage or remove them."
            action={<Button asChild variant="outline"><Link href="/dashboard/integrations">View integrations</Link></Button>}
          />
        ) : (
          <div className="space-y-3">
            {list.map((s) => {
              const def = getIntegration(s.type);
              // Supabase types to-one joins as arrays; normalize both shapes.
              const joined = s.clients as { name: string } | { name: string }[] | null;
              const clientName = (Array.isArray(joined) ? joined[0]?.name : joined?.name) ?? "Unknown client";
              return (
                <Card key={s.id}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-ink-900">{def?.name ?? s.type}</p>
                        <Badge variant="muted">{clientName}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-ink-400">
                        {s.display_name ? `Connected as ${s.display_name} · ` : ""}
                        {s.last_synced_at
                          ? `Last synced ${formatDistanceToNow(new Date(s.last_synced_at), { addSuffix: true })}`
                          : "Not synced yet"}
                      </p>
                    </div>
                    <DisconnectSource dataSourceId={s.id} label={`${def?.name ?? s.type} for ${clientName}`} />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-ink-700">Delete your account</h2>
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div className="flex items-start gap-3">
              <Database size={18} className="mt-0.5 shrink-0 text-ink-400" />
              <p className="max-w-md text-sm leading-relaxed text-ink-600">
                To permanently delete your account and everything in it — clients, connections, snapshots, and
                reports — email us and we&apos;ll complete it within 30 days.
              </p>
            </div>
            <Button asChild variant="outline">
              <a href={`mailto:${COMPANY.privacyEmail}?subject=Account%20deletion%20request`}>Request deletion</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
