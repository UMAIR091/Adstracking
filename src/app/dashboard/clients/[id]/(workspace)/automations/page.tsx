import { notFound, redirect } from "next/navigation";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { createClient } from "@/lib/supabase/server";
import { ClientSection } from "@/components/ClientSection";
import { ReportSchedule, type ScheduleData } from "@/components/ReportSchedule";
import { DeliveryHistory, type DeliveryLog } from "@/components/DeliveryHistory";
import { loadClientWorkspace } from "@/lib/clients/workspace";

export const dynamic = "force-dynamic";

// Automations — what is scheduled, and what has actually gone out.
//
// ReportSchedule now leads with the schedule itself — status, cadence, next
// delivery and recipients — and keeps the form behind an explicit Edit, so
// reading the automation and changing it are no longer the same screen. Same
// component, same props, same routes behind every button.
//
// Delivery history renders bare here because the section above it is already
// titled; on a report page it keeps its own card. It selects `source` so a
// scheduled send is distinguishable from a manual one — on the automations tab
// that difference is the whole point.
export default async function ClientAutomationsPage({ params }: { params: { id: string } }) {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) redirect("/login");

  const supabase = createClient();
  const { data: client } = await supabase
    .from("clients")
    .select("id, email")
    .eq("id", params.id)
    .maybeSingle();
  if (!client) notFound();

  const ws = await loadClientWorkspace(supabase, client.id as string);

  const [{ data: schedule }, { data: deliveryLogs }] = await Promise.all([
    supabase
      .from("report_schedules")
      .select("frequency, recipients, enabled, next_run_at, send_day, send_hour, subject, message")
      .eq("client_id", client.id)
      .maybeSingle(),
    supabase
      .from("email_logs")
      .select("id, to_email, subject, status, sent_at, attempts, error, source, reports!inner(client_id)")
      .eq("reports.client_id", client.id)
      .order("sent_at", { ascending: false })
      .limit(8),
  ]);

  const logs = (deliveryLogs as unknown as DeliveryLog[]) ?? [];

  return (
    <div>
      <ClientSection title="Scheduled delivery" description="Send this client's report automatically, on a cadence.">
        <ReportSchedule
          clientId={client.id as string}
          clientEmail={(client.email as string | null) ?? null}
          schedule={(schedule as unknown as ScheduleData) ?? null}
          brandingReady={!!agency.logo_url}
          dataReady={ws.hasSyncedData}
          dataBlockedReason={ws.dataBlockedReason}
        />
      </ClientSection>

      <ClientSection
        title="Delivery history"
        description={
          logs.length === 0
            ? "Every report emailed to this client will be listed here."
            : `The last ${logs.length} email${logs.length === 1 ? "" : "s"} sent to this client.`
        }
      >
        <DeliveryHistory logs={logs} bare />
      </ClientSection>
    </div>
  );
}
