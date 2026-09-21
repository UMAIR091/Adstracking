import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { ReportDocument } from "@/components/ReportDocument";
import { ReportActions } from "@/components/ReportActions";
import { DownloadPdf } from "@/components/DownloadPdf";
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
  const agency = report?.branding?.name?.trim();
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
