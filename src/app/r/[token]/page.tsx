import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { ReportDocument } from "@/components/ReportDocument";
import { ReportActions } from "@/components/ReportActions";

export const dynamic = "force-dynamic";

// Shared client reports must never be indexed: the share token is the only
// access control, so search engines indexing it would leak private client data.
export const metadata = {
  robots: { index: false, follow: false },
};

// Public, unauthenticated report — accessed via an unguessable share token.
export default async function PublicReportPage({ params }: { params: { token: string } }) {
  const admin = createAdminClient();
  const { data: report } = await admin
    .from("reports")
    .select("title, period_start, period_end, data, share_token, agency_id, clients(name)")
    .eq("share_token", params.token)
    .maybeSingle();
  if (!report) notFound();

  const { data: agency } = await admin
    .from("agencies")
    .select("name, logo_url, brand_color, website, footer_text")
    .eq("id", report.agency_id)
    .maybeSingle();

  const c = report.clients as unknown as { name: string | null } | { name: string | null }[] | null;
  const clientName = (Array.isArray(c) ? c[0]?.name : c?.name) ?? "Client";

  return (
    <div className="min-h-screen bg-[#f6f7f9] py-8">
      <div className="mx-auto max-w-3xl px-4">
        <div className="no-print mb-4 flex justify-end">
          <ReportActions shareUrl="" />
        </div>
        <ReportDocument
          branding={{
            name: agency?.name ?? "Agency",
            logo_url: agency?.logo_url ?? null,
            brand_color: agency?.brand_color ?? "#4f46e5",
            website: agency?.website ?? null,
            footer_text: agency?.footer_text ?? null,
          }}
          clientName={clientName}
          title={report.title}
          period={{ start: report.period_start as string, end: report.period_end as string }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data={report.data as any}
        />
      </div>
    </div>
  );
}
