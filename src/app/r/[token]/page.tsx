import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { ReportDocument } from "@/components/ReportDocument";
import { ReportActions } from "@/components/ReportActions";
import { DownloadPdf } from "@/components/DownloadPdf";
import { loadReportForRender } from "@/lib/reports/branding";

export const dynamic = "force-dynamic";

// Shared client reports must never be indexed: the share token is the only
// access control, so search engines indexing it would leak private client data.
export const metadata = {
  robots: { index: false, follow: false },
};

// Public, unauthenticated report — accessed via an unguessable share token.
export default async function PublicReportPage({ params }: { params: { token: string } }) {
  const admin = createAdminClient();
  // Same loader the authenticated views use: branding from the report's own
  // agency, client name from its own client.
  const report = await loadReportForRender(admin, { shareToken: params.token });
  if (!report) notFound();

  return (
    <div className="min-h-screen bg-surface-muted py-8">
      <div className="mx-auto max-w-3xl px-4">
        {/* A client opening this link has one thing to do with it, so the
            download is the filled button and print/copy stay secondary. */}
        <div className="no-print mb-4 flex justify-end gap-2">
          <ReportActions shareUrl="" />
          <DownloadPdf href={`/r/${params.token}/pdf`} filename="report.pdf" variant="default" />
        </div>
        <ReportDocument
          branding={{
            name: report.branding.name,
            logo_url: report.branding.logo_url,
            brand_color: report.branding.brand_color,
            website: report.branding.website,
            footer_text: report.branding.footer_text,
          }}
          clientName={report.clientName}
          clientLogoUrl={report.clientLogoUrl}
          title={report.title}
          period={report.period}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data={report.data as any}
        />
      </div>
    </div>
  );
}
