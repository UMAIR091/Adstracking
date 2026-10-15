import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { FileText } from "lucide-react";
import { ConnectStatusToast } from "@/components/ConnectStatusToast";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/status-chip";
import { ClientTabs } from "@/components/ClientTabs";
import { ClientMonogram } from "@/components/dashboard/HomeCards";
import { NewReportButton } from "@/components/GenerateReportDialog";
import { getIntegrationHealthCached } from "@/lib/integrationHealth";
import { clientStatusMap, statusFor } from "@/lib/dashboard/clientStatus";

export const dynamic = "force-dynamic";

// The client workspace shell: identity and navigation, held across every tab.
// `edit` deliberately sits outside this group — it has its own page chrome and
// is not a workspace tab. The sample report lives on Home and Reports, so the
// header carries only this client's two actions.
export default async function ClientWorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { id: string };
}) {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) redirect("/login");

  const supabase = createClient();
  const [{ data: client }, healthRows] = await Promise.all([
    supabase.from("clients").select("id, name, website, email, logo_url").eq("id", params.id).maybeSingle(),
    getIntegrationHealthCached(agency.id),
  ]);
  if (!client) notFound();

  const status = statusFor(clientStatusMap(healthRows), client.id as string);
  const contact = [client.website, client.email].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-5">
      {/* Connect callbacks can land on any tab, so the toast lives with the
          shell rather than with one section. */}
      <Suspense fallback={null}>
        <ConnectStatusToast />
      </Suspense>

      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px] text-ink-400">
        <Link href="/dashboard/clients" className="hover:text-ink-900">Clients</Link>
        <span aria-hidden>/</span>
        <span aria-current="page" className="truncate text-ink-900">{client.name}</span>
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <ClientMonogram name={client.name as string} logoUrl={(client.logo_url as string | null) ?? null} size={52} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-[clamp(22px,3vw,28px)] font-semibold tracking-[-0.03em] text-ink-900">{client.name}</h1>
              <StatusChip tone={status.tone}>{status.label}</StatusChip>
            </div>
            <p className="mt-0.5 truncate text-[13.5px] text-ink-400">{contact || "No website or email"}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={`/dashboard/clients/${client.id}/edit`}>Edit client</Link>
          </Button>
          <NewReportButton clientId={client.id as string}>
            <FileText size={15} aria-hidden /> Generate report
          </NewReportButton>
        </div>
      </div>

      <ClientTabs clientId={client.id as string} />

      <div>{children}</div>
    </div>
  );
}
