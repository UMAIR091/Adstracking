import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ClientSection } from "@/components/ClientSection";
import { ConnectAccountButton } from "@/components/ConnectAccountModal";
import { loadClientWorkspace } from "@/lib/clients/workspace";
import { SOURCE_HEALTH } from "@/lib/integrations/status";
import { format } from "date-fns";

export const dynamic = "force-dynamic";

// Overview: where this client stands, and what needs doing.
//
// Every figure and every alert here is already computed for the other tabs —
// the connected count and health classification from the workspace loader, the
// blocked reason it already derives, the schedule and report rows the Reports
// and Automations tabs read. Nothing new is calculated and nothing is
// estimated; a client with nothing connected says so rather than showing zeros
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

  const ws = await loadClientWorkspace(supabase, client.id as string);

  const [{ count: reportCount }, { data: schedule }] = await Promise.all([
    supabase.from("reports").select("id", { count: "exact", head: true }).eq("client_id", client.id),
    supabase
      .from("report_schedules")
      .select("frequency, enabled, next_run_at")
      .eq("client_id", client.id)
      .maybeSingle(),
  ]);

  const lastSynced = ws.connectedIntegrations
    .map((i) => i.lastSyncedAt)
    .filter((d): d is string => Boolean(d))
    .sort()
    .at(-1);

  const scheduleEnabled = Boolean(schedule?.enabled && schedule?.next_run_at);
  const base = `/dashboard/clients/${client.id}`;

  const stats: { label: string; value: string; hint?: string; href: string }[] = [
    {
      label: "Data sources",
      value: String(ws.connectedIntegrations.length),
      hint: ws.connectedIntegrations.length === 0 ? "none connected" : `${ws.vizSources.length} with data`,
      href: `${base}/data-sources`,
    },
    {
      label: "Needs attention",
      value: String(ws.needingAttention.length),
      hint: ws.needingAttention.length === 0 ? "all healthy" : "see data sources",
      href: `${base}/data-sources`,
    },
    {
      label: "Reports",
      value: String(reportCount ?? 0),
      hint: lastSynced ? `data synced ${format(new Date(lastSynced), "d MMM")}` : "no synced data yet",
      href: `${base}/reports`,
    },
    {
      label: "Scheduled delivery",
      value: scheduleEnabled ? (schedule!.frequency as string) : "Off",
      hint: scheduleEnabled ? `next ${format(new Date(schedule!.next_run_at as string), "d MMM")}` : "not scheduled",
      href: `${base}/automations`,
    },
  ];

  return (
    <div>
      <ClientSection
        title="Status"
        description="Where this client stands right now."
        action={<ConnectAccountButton clientId={client.id as string} integrations={ws.connectableIntegrations} label="Add data source" />}
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((s) => (
            <Link
              key={s.label}
              href={s.href}
              className="rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300 hover:bg-surface-subtle"
            >
              <p className="text-xs text-ink-500">{s.label}</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-ink-900">{s.value}</p>
              {s.hint ? <p className="mt-0.5 text-xs text-ink-500">{s.hint}</p> : null}
            </Link>
          ))}
        </div>
      </ClientSection>

      {/* Alerts, in the order they block work: a broken source first, then the
          reason reporting is unavailable. Both are the same strings the other
          tabs show, so the workspace never contradicts itself. */}
      {(ws.needingAttention.length > 0 || ws.dataBlockedReason) && (
        <ClientSection title="Needs your attention" description="Fix these and the rest of the workspace unblocks.">
          <div className="space-y-3">
            {ws.needingAttention.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
                <span className="flex items-start gap-2">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
                  <span>
                    <span className="font-semibold">
                      {ws.needingAttention.length} source{ws.needingAttention.length === 1 ? "" : "s"} need attention:
                    </span>{" "}
                    {ws.needingAttention.map((i, n) => (
                      <span key={i.def.id}>
                        {n > 0 && ", "}
                        {i.def.name} ({SOURCE_HEALTH[i.health!].short.toLowerCase()})
                      </span>
                    ))}
                  </span>
                </span>
                <Button asChild variant="outline" size="sm">
                  <Link href={`${base}/data-sources`}>Review sources</Link>
                </Button>
              </div>
            )}

            {ws.dataBlockedReason && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-surface-subtle px-3.5 py-3 text-sm text-ink-700">
                <span>{ws.dataBlockedReason}</span>
                <Button asChild variant="outline" size="sm">
                  <Link href={`${base}/data-sources`}>Go to data sources</Link>
                </Button>
              </div>
            )}
          </div>
        </ClientSection>
      )}

      <ClientSection title="Continue" description="The rest of this client's workspace.">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: "Performance", copy: "Metrics from every connected source.", href: `${base}/performance` },
            { label: "Reports", copy: "Generate a branded report, or revisit past ones.", href: `${base}/reports` },
            { label: "Automations", copy: "Put delivery on a schedule.", href: `${base}/automations` },
          ].map((c) => (
            <Link
              key={c.label}
              href={c.href}
              className="group rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300 hover:bg-surface-subtle"
            >
              <p className="flex items-center gap-1.5 text-sm font-medium text-ink-900">
                {c.label}
                <ArrowRight size={14} className="text-ink-400 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </p>
              <p className="mt-1 text-sm leading-relaxed text-ink-500">{c.copy}</p>
            </Link>
          ))}
        </div>
      </ClientSection>
    </div>
  );
}
