import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { getOrRenderReportPdf } from "@/lib/pdf/cache";
import { loadReportForRender } from "@/lib/reports/branding";
import { rateLimit, tooManyRequests } from "@/lib/rateLimit";
import { publicError } from "@/lib/errors";

export const runtime = "nodejs";
export const maxDuration = 60;

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "report";
}

// Generates and returns the report as a downloadable branded PDF.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Rendering a PDF is fontkit plus a wasm layout engine. The public share route
  // has been bounded since audit #3; this one was the remaining unbounded render.
  const rl = await rateLimit(`report-pdf:${agency.id}`, { limit: 30, windowSeconds: 60 });
  if (!rl.allowed) return tooManyRequests(rl.windowSeconds);

  const supabase = createClient();
  // Branding comes from the agency the REPORT belongs to, and the client name
  // from the client it was generated for — not from the signed-in session,
  // which is how one workspace's brand ended up on another's report.
  //
  // Authorization stays on the user client: RLS scopes the read and `agency.id`
  // states the same scope in the query.
  const report = await loadReportForRender(supabase, { id: params.id }, agency.id);
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });

  try {
    // Serve from the same Storage cache the public share link and email delivery
    // use. This route rendered from scratch on every click — the one PDF path
    // that did — so an agency re-downloading its own report paid the full render
    // each time while its client's link was served a cached copy.
    //
    // The cache needs the service role: the `report-pdfs` bucket is private and
    // the write-back updates reports.pdf_cached_hash. Only the cache I/O uses
    // it; the authorization check above already passed on the user client.
    const pdf = await getOrRenderReportPdf(
      createAdminClient(),
      { id: report.id, pdf_cached_hash: report.pdfCachedHash },
      {
        data: report.data,
        branding: report.branding,
        clientName: report.clientName,
        clientLogoUrl: report.clientLogoUrl,
        title: report.title,
        period: report.period,
      }
    );
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${slug(report.title)}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const { error } = publicError(err, "Couldn't generate the PDF. Please try again.", { route: "reports_pdf", agencyId: agency.id });
    return NextResponse.json({ error }, { status: 500 });
  }
}
