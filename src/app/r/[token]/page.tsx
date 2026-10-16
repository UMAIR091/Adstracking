import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { ReportDocument } from "@/components/ReportDocument";
import { ReportActions } from "@/components/ReportActions";
import { DownloadPdf } from "@/components/DownloadPdf";
import { ReportToc } from "@/components/report/ReportToc";
import { loadReportForRender } from "@/lib/reports/branding";

export const dynamic = "force-dynamic";

// generateMetadata and the page body both need the report, and each was doing
// its own full load — report + agency + client, twice per public page view.
// React's cache() dedupes them within a single request. Keyed on the token, not
// on a Supabase client (a fresh one per call would never match).
const loadSharedReport = cache(async (token: string) =>
  loadReportForRender(createAdminClient(), { shareToken: token })
);

// White-label the shared report's own metadata. Without this the page inherits
// the root layout's Anavyst marketing title/OG, so a client opening the link
// (or a link preview of it) would see "Anavyst" in the tab and social card.
// The report already carries the agency's branding, so the tab/OG show the
// agency's name instead — never Anavyst. Still noindex: the share token is
// the only access control, so search engines must not index it.
export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const report = await loadSharedReport(params.token);
  // Called here, not only in the page: metadata resolves before the response
  // starts streaming, so a missing or revoked link gets a real 404 status. From
  // the page body alone it rendered "Page not found" with a 200.
  if (!report) notFound();
  const agency = report.branding?.name?.trim();
  const title = agency ? `${agency} — Performance Report` : "Performance Report";
  const description = agency ? `Performance report prepared by ${agency}.` : "Performance report.";
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, siteName: agency || undefined, type: "article" },
    twitter: { card: "summary", title, description },
  };
}

// Public, unauthenticated report — accessed via an unguessable share token.
export default async function PublicReportPage({ params }: { params: { token: string } }) {
  // Same loader the authenticated views use: branding from the report's own
  // agency, client name from its own client.
  const report = await loadSharedReport(params.token);
  if (!report) notFound();

  // A client opening this link has one thing to do with it, so the download is
  // the filled button and print/copy stay secondary.
  const actions = (
    <>
      <DownloadPdf href={`/r/${params.token}/pdf`} filename="report.pdf" variant="default" />
      <ReportActions shareUrl="" />
    </>
  );

  return (
    <div className="min-h-screen bg-surface-muted py-8">
      {/* From 1080px the contents rail sits beside the report, carrying the
          actions; below that the actions stay above the report as before. No
          Anavyst branding anywhere: this page is the agency's. */}
      <div className="mx-auto flex max-w-[1200px] items-start gap-8 px-4 sm:px-6">
        <ReportToc targetId="shared-report">
          <div className="flex flex-col gap-2 [&_.no-print]:flex-col [&_.no-print]:items-stretch [&_a]:w-full [&_button]:w-full">
            {actions}
          </div>
        </ReportToc>
        <div id="shared-report" className="min-w-0 flex-1">
        <div className="no-print mx-auto mb-4 flex max-w-[880px] flex-wrap justify-end gap-2 min-[1080px]:hidden">
          {actions}
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
    </div>
  );
}
