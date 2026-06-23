import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { createClient } from "@/lib/supabase/server";
import { ReportDocument } from "@/components/ReportDocument";
import { ReportActions } from "@/components/ReportActions";

export const dynamic = "force-dynamic";

export default async function ReportViewPage({ params }: { params: { id: string } }) {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) redirect("/login");

  const supabase = createClient();
  const { data: report } = await supabase
    .from("reports")
    .select("id, client_id, title, period_start, period_end, data, share_token, clients(name)")
    .eq("id", params.id)
    .maybeSingle();
  if (!report) notFound();

  const c = report.clients as unknown as { name: string | null } | { name: string | null }[] | null;
  const clientName = (Array.isArray(c) ? c[0]?.name : c?.name) ?? "Client";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const shareUrl = `${appUrl}/r/${report.share_token}`;

  return (
    <div className="space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link href="/dashboard/reports" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-700">
          <ArrowLeft size={15} /> Back to reports
        </Link>
        <ReportActions shareUrl={shareUrl} />
      </div>

      <ReportDocument
        branding={{ name: agency.name, logo_url: agency.logo_url, brand_color: agency.brand_color, website: agency.website, footer_text: agency.footer_text }}
        clientName={clientName}
        title={report.title}
        period={{ start: report.period_start as string, end: report.period_end as string }}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data={report.data as any}
      />
    </div>
  );
}
