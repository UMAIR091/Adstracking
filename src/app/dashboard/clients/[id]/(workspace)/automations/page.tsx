import { notFound, redirect } from "next/navigation";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { createClient } from "@/lib/supabase/server";
import { ClientSection } from "@/components/ClientSection";
import { ReportSchedule, type ScheduleData } from "@/components/ReportSchedule";
import { DeliveryHistory, type DeliveryLog } from "@/components/DeliveryHistory";
import { loadClientWorkspace } from "@/lib/clients/workspace";

export const dynamic = "force-dynamic";

// Automations — scheduled delivery and what has actually gone out.
//
// Both components are the ones the client page already rendered, with the same
// props. Delivery history shows its empty state here: on a tab named for
// automated delivery, "nothing sent yet" is the answer to the question the tab
// asks, not the noise it was at the foot of a long page.
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
      .select("id, to_email, subject, status, sent_at, attempts, error, reports!inner(client_id)")
      .eq("reports.client_id", client.id)
      .order("sent_at", { ascending: false })
      .limit(8),
  ]);

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

      <ClientSection title="Delivery history" description="Every report emailed to this client.">
        <DeliveryHistory logs={(deliveryLogs as unknown as DeliveryLog[]) ?? []} />
      </ClientSection>
    </div>
  );
}
