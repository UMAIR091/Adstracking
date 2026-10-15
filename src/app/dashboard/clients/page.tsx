import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ClientsList, type ClientRow } from "@/components/ClientsList";
import { ConnectStatusToast } from "@/components/ConnectStatusToast";
import { ClientUsageMeter } from "@/components/UsageMeter";
import { checkClientLimit } from "@/lib/billing/limits";
import { getIntegrationHealthCached } from "@/lib/integrationHealth";
import { clientStatusMap, statusFor, CLIENT_STATUS_PRIORITY } from "@/lib/dashboard/clientStatus";

export const dynamic = "force-dynamic";

type Raw = Omit<ClientRow, "status" | "lastReport" | "nextDelivery">;

export default async function ClientsPage() {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) redirect("/login");

  const supabase = createClient();
  const [{ data }, usage, healthRows, { data: reports }, { data: schedules }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, logo_url, email, website, notes, archived, data_sources(type, updated_at)")
      .order("created_at", { ascending: false }),
    checkClientLimit(supabase, agency.id),
    getIntegrationHealthCached(agency.id),
    // Newest first, so the first row per client is its latest report.
    supabase.from("reports").select("client_id, created_at").order("created_at", { ascending: false }).limit(1000),
    supabase.from("report_schedules").select("client_id, frequency, next_run_at").eq("enabled", true).order("next_run_at", { ascending: true }),
  ]);

  const statuses = clientStatusMap(healthRows);
  const lastReport = new Map<string, string>();
  for (const r of (reports ?? []) as { client_id: string | null; created_at: string }[]) {
    if (r.client_id && !lastReport.has(r.client_id)) lastReport.set(r.client_id, r.created_at);
  }
  const nextDelivery = new Map<string, { frequency: string; next_run_at: string }>();
  for (const s of (schedules ?? []) as { client_id: string | null; frequency: string; next_run_at: string }[]) {
    if (s.client_id && !nextDelivery.has(s.client_id)) nextDelivery.set(s.client_id, s);
  }

  const rows: ClientRow[] = ((data ?? []) as Raw[]).map((c) => {
    const last = lastReport.get(c.id);
    const next = nextDelivery.get(c.id);
    return {
      ...c,
      status: statusFor(statuses, c.id),
      lastReport: last ? format(new Date(last), "d MMM yyyy") : null,
      nextDelivery: next
        ? `${format(new Date(next.next_run_at), "d MMM")} · ${next.frequency.charAt(0).toUpperCase()}${next.frequency.slice(1)}`
        : null,
    };
  });
  // "Sorted by what needs you": reconnects first, then the other problems, then
  // healthy clients; newest-first within each.
  rows.sort((a, b) => CLIENT_STATUS_PRIORITY[a.status.key] - CLIENT_STATUS_PRIORITY[b.status.key]);

  const active = rows.filter((c) => !c.archived).length;
  const archived = rows.length - active;

  return (
    <div className="flex flex-col gap-5">
      <Suspense fallback={null}>
        <ConnectStatusToast />
      </Suspense>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[clamp(24px,3vw,28px)] font-semibold tracking-[-0.03em] text-ink-900">Clients</h1>
          <p className="mt-1 text-[14.5px] text-ink-500">
            {rows.length ? `${active} active · ${archived} archived · sorted by what needs you` : "No clients yet"}
          </p>
          {rows.length > 0 && (
            <div className="mt-3">
              <ClientUsageMeter used={usage.current} limit={usage.limit} planName={usage.planName} isTrial={usage.isTrial} />
            </div>
          )}
        </div>
        <Button asChild>
          <Link href="/dashboard/clients/new">
            <Plus size={15} strokeWidth={2.2} aria-hidden /> Add client
          </Link>
        </Button>
      </div>

      <ClientsList clients={rows} />
    </div>
  );
}
