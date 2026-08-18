import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { renderReportPdf } from "@/lib/pdf";
import { loadReportForRender } from "@/lib/reports/branding";

export const runtime = "nodejs";
export const maxDuration = 60;

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "report";
}

// Generates and returns the report as a downloadable branded PDF.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createClient();
  // Branding comes from the agency the REPORT belongs to, and the client name
  // from the client it was generated for — not from the signed-in session,
  // which is how one workspace's brand ended up on another's report.
  const report = await loadReportForRender(supabase, { id: params.id }, agency.id);
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });

  try {
    const pdf = await renderReportPdf({
      data: report.data,
      branding: report.branding,
      clientName: report.clientName,
      clientLogoUrl: report.clientLogoUrl,
      title: report.title,
      period: report.period,
    });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${slug(report.title)}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: `Couldn't generate the PDF: ${(err as Error).message}` }, { status: 500 });
  }
}
