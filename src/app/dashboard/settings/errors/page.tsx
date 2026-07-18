import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Activity, AlertTriangle, RefreshCw, PlugZap } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { createClient } from "@/lib/supabase/server";
import { getIntegration } from "@/lib/integrations/registry";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

// Supabase returns nested relations as arrays (or a single object), so accept both.
type Named = { name: string | null };
type DsRel = { clients: Named | Named[] | null };
type Row = {
  id: string;
  context: string;
  provider: string | null;
  error_type: string;
  message: string;
  retry_status: string | null;
  created_at: string;
  data_sources: DsRel | DsRel[] | null;
};

const CONTEXT_LABEL: Record<string, string> = {
  sync: "Sync",
  oauth_callback: "Connection",
  report: "Report",
  cron: "Scheduled job",
  api_route: "API",
};

// Retry status → how it reads + how it looks. needs_reconnect is the only one
// that requires the user to act; the rest resolve on their own.
function retryBadge(status: string | null): { label: string; className: string; icon: typeof RefreshCw } {
  switch (status) {
    case "needs_reconnect":
      return { label: "Needs reconnect", className: "bg-amber-50 text-amber-700 border-amber-200", icon: PlugZap };
    case "will_retry":
      return { label: "Will retry", className: "bg-sky-50 text-sky-700 border-sky-200", icon: RefreshCw };
    case "exhausted":
      return { label: "Retries exhausted", className: "bg-red-50 text-red-700 border-red-200", icon: AlertTriangle };
    default:
      return { label: "Logged", className: "bg-slate-50 text-ink-600 border-slate-200", icon: AlertTriangle };
  }
}

function clientName(row: Row): string {
  const ds = Array.isArray(row.data_sources) ? row.data_sources[0] : row.data_sources;
  const c = ds?.clients;
  const name = Array.isArray(c) ? c[0]?.name : c?.name;
  return name ?? "—";
}

export default async function SyncHealthPage() {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) redirect("/login");

  const supabase = createClient();
  // RLS scopes this to the caller's agency. If the migration hasn't been applied
  // yet the query errors — treat that as "nothing to show" rather than crashing.
  const { data, error } = await supabase
    .from("sync_errors")
    .select("id, context, provider, error_type, message, retry_status, created_at, data_sources(clients(name))")
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = (error ? [] : (data ?? [])) as unknown as Row[];
  const needsAttention = rows.filter((r) => r.retry_status === "needs_reconnect").length;

  return (
    <div>
      <Link href="/dashboard/settings" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-700">
        <ArrowLeft size={15} /> Back to settings
      </Link>
      <div className="mb-6 mt-3 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
          <Activity size={18} />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Sync health</h1>
          <p className="text-sm text-ink-500">
            The 100 most recent failures across syncs, connections, reports and scheduled jobs.
          </p>
        </div>
      </div>

      {needsAttention > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          <PlugZap size={16} className="mt-0.5 shrink-0" />
          <span>
            <span className="font-semibold">{needsAttention}</span> connection{needsAttention === 1 ? "" : "s"} need reconnecting — open the client and click Reconnect. Everything else retries automatically.
          </span>
        </div>
      )}

      {rows.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <Activity size={20} />
            </div>
            <p className="font-medium text-ink-900">No failures recorded</p>
            <p className="mt-1 text-sm text-ink-500">Syncs, connections, reports and scheduled jobs are all running cleanly.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs text-ink-400">
                    <th className="px-4 py-3 font-medium">When</th>
                    <th className="px-4 py-3 font-medium">Source</th>
                    <th className="px-4 py-3 font-medium">Client</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const badge = retryBadge(r.retry_status);
                    const providerName = r.provider ? getIntegration(r.provider)?.name ?? r.provider : CONTEXT_LABEL[r.context] ?? r.context;
                    return (
                      <tr key={r.id} className="border-b border-slate-50 last:border-0 align-top">
                        <td className="whitespace-nowrap px-4 py-3 text-ink-500" title={new Date(r.created_at).toLocaleString()}>
                          {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className="font-medium text-ink-800">{providerName}</span>
                          <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-ink-500">{CONTEXT_LABEL[r.context] ?? r.context}</span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-ink-700">{clientName(r)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-ink-600">{r.error_type}</td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${badge.className}`}>
                            <badge.icon size={11} /> {badge.label}
                          </span>
                        </td>
                        <td className="max-w-md px-4 py-3 text-ink-600">
                          <span className="line-clamp-2" title={r.message}>{r.message}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
