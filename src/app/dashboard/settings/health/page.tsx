import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, HeartPulse, CheckCircle2, AlertCircle, PlugZap, KeyRound, Plug } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { createClient } from "@/lib/supabase/server";
import { getIntegrationHealth, summarize, type IntegrationHealth } from "@/lib/integrationHealth";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const rel = (t: string | null) => (t ? formatDistanceToNow(new Date(t), { addSuffix: true }) : "—");

function StatusBadge({ status }: { status: IntegrationHealth["status"] }) {
  const map = {
    connected: { label: "Connected", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
    error: { label: "Sync error", cls: "bg-red-50 text-red-700 border-red-200", Icon: AlertCircle },
    revoked: { label: "Reconnect", cls: "bg-amber-50 text-amber-700 border-amber-200", Icon: PlugZap },
  }[status];
  const { Icon } = map;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${map.cls}`}>
      <Icon size={11} /> {map.label}
    </span>
  );
}

function TokenBadge({ token }: { token: IntegrationHealth["token"] }) {
  const cls =
    token.state === "reconnect" ? "text-amber-700" :
    token.state === "expiring" ? "text-amber-700" : "text-ink-500";
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${cls}`}>
      <KeyRound size={11} /> {token.label}
    </span>
  );
}

function Summary({ label, value, cls, icon: Icon }: { label: string; value: number; cls: string; icon: typeof Plug }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${cls}`}>
          <Icon size={16} />
        </div>
        <div>
          <p className="text-xl font-semibold text-ink-900">{value}</p>
          <p className="text-xs text-ink-500">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function IntegrationHealthPage() {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) redirect("/login");

  const supabase = createClient();
  const rows = await getIntegrationHealth(supabase, agency.id);
  const s = summarize(rows);

  return (
    <div>
      <Link href="/dashboard/settings" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-700">
        <ArrowLeft size={15} /> Back to settings
      </Link>
      <div className="mb-6 mt-3 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
          <HeartPulse size={18} />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Integration health</h1>
          <p className="text-sm text-ink-500">Live status of every connected data source across your clients.</p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Summary label="Connected" value={s.connected} cls="bg-emerald-50 text-emerald-600" icon={CheckCircle2} />
        <Summary label="Sync errors" value={s.errored} cls="bg-red-50 text-red-600" icon={AlertCircle} />
        <Summary label="Need reconnect" value={s.needsReconnect} cls="bg-amber-50 text-amber-600" icon={PlugZap} />
        <Summary label="Total sources" value={s.total} cls="bg-slate-100 text-ink-600" icon={Plug} />
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-ink-500">
              <Plug size={20} />
            </div>
            <p className="font-medium text-ink-900">No connected data sources yet</p>
            <p className="mt-1 text-sm text-ink-500">Connect an integration on a client to see its health here.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs text-ink-400">
                    <th className="px-4 py-3 font-medium">Source</th>
                    <th className="px-4 py-3 font-medium">Client</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Last success</th>
                    <th className="px-4 py-3 font-medium">Last failure</th>
                    <th className="px-4 py-3 font-medium">Token</th>
                    <th className="px-4 py-3 font-medium">Last error</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-slate-50 align-top last:border-0">
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-ink-800">{r.providerName}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-ink-700">{r.clientName}</td>
                      <td className="whitespace-nowrap px-4 py-3"><StatusBadge status={r.status} /></td>
                      <td className="whitespace-nowrap px-4 py-3 text-ink-600" title={r.lastSyncedAt ?? ""}>{rel(r.lastSyncedAt)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-ink-600" title={r.lastSyncFailedAt ?? ""}>{rel(r.lastSyncFailedAt)}</td>
                      <td className="whitespace-nowrap px-4 py-3" title={r.tokenExpiresAt ?? ""}><TokenBadge token={r.token} /></td>
                      <td className="max-w-xs px-4 py-3 text-ink-500">
                        {r.lastSyncError ? <span className="line-clamp-2" title={r.lastSyncError}>{r.lastSyncError}</span> : <span className="text-ink-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
