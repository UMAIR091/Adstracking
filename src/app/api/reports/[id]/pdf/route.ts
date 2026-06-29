import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { renderReportPdf } from "@/lib/pdf";

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
  const { data: report } = await supabase
    .from("reports")
    .select("id, title, period_start, period_end, data, clients(name)")
    .eq("id", params.id)
    .maybeSingle();
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });

  const c = report.clients as unknown as { name: string | null } | { name: string | null }[] | null;
  const clientName = (Array.isArray(c) ? c[0]?.name : c?.name) ?? "Client";

  try {
    const pdf = await renderReportPdf({
      data: report.data,
      branding: { name: agency.name, brand_color: agency.brand_color, website: agency.website, footer_text: agency.footer_text, contact_email: agency.contact_email },
      clientName,
      title: report.title,
      period: { start: report.period_start as string, end: report.period_end as string },
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
