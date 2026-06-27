import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Eye } from "lucide-react";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { GoogleConnect, type GscSource } from "@/components/GoogleConnect";
import { GscAnalytics, type GscReportData } from "@/components/GscAnalytics";
import { SAMPLE_GSC } from "@/lib/sampleData";
import { GenerateReport } from "@/components/GenerateReport";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) redirect("/login");

  const supabase = createClient();
  const { data: client } = await supabase
    .from("clients")
    .select("id, name, website, email")
    .eq("id", params.id)
    .maybeSingle();
  if (!client) notFound();

  // Never select token columns into the page — only safe fields.
  const { data: gsc } = await supabase
    .from("data_sources")
    .select("id, display_name, config, last_synced_at, last_sync_error")
    .eq("client_id", client.id)
    .eq("type", "gsc")
    .maybeSingle();

  // Read cached metrics from the DB (synced by the background job) — no live
  // Google call on page load.
  let snapshot: GscReportData | null = null;
  if (gsc?.id) {
    const { data: snap } = await supabase
      .from("gsc_snapshots")
      .select("data")
      .eq("data_source_id", gsc.id)
      .eq("period_days", 28)
      .maybeSingle();
    snapshot = (snap?.data as GscReportData | undefined) ?? null;
  }

  return (
    <div>
      <Link href="/dashboard/clients" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-700">
        <ArrowLeft size={15} /> Back to clients
      </Link>
      <div className="mb-6 mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{client.name}</h1>
          <p className="text-sm text-ink-500">{client.website || client.email || "—"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/reports/preview"><Eye size={16} /> Preview report</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/dashboard/clients/${client.id}/edit`}>Edit client</Link>
          </Button>
        </div>
      </div>

      <h2 className="mb-3 text-sm font-medium text-ink-700">Data sources</h2>
      <div className="space-y-3">
        <GoogleConnect
          clientId={client.id}
          source={(gsc ?? null) as GscSource}
          lastSyncedAt={(gsc?.last_synced_at as string | null) ?? null}
          lastSyncError={(gsc?.last_sync_error as string | null) ?? null}
        />

        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-ink-500">
          Google Analytics 4 and Google Sheets connectors are coming in the next phase.
        </div>
      </div>

      {/* Performance — real cached metrics, or a sample placeholder until connected. */}
      <div className="mt-6">
        {snapshot ? (
          <GscAnalytics report={snapshot} />
        ) : (
          <GscAnalytics report={SAMPLE_GSC} sample />
        )}
      </div>

      <div className="mt-8">
        <GenerateReport clientId={client.id} ready={Boolean((gsc?.config as { site_url?: string } | undefined)?.site_url)} />
      </div>
    </div>
  );
}
