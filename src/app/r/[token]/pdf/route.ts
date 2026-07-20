import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderReportPdf } from "@/lib/pdf";

export const runtime = "nodejs";
export const maxDuration = 60;

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "report";
}

// Public PDF download for a shared report — accessed via the unguessable share
// token, the same access control as the public report page.
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const admin = createAdminClient();
  const { data: report } = await admin
    .from("reports")
    .select("title, period_start, period_end, data, agency_id, clients(name)")
    .eq("share_token", params.token)
    .maybeSingle();
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });

  const { data: agency } = await admin
    .from("agencies")
    .select("name, brand_color, website, footer_text, contact_email, logo_url")
    .eq("id", report.agency_id)
    .maybeSingle();

  const c = report.clients as unknown as { name: string | null } | { name: string | null }[] | null;
  const clientName = (Array.isArray(c) ? c[0]?.name : c?.name) ?? "Client";

  try {
    const pdf = await renderReportPdf({
      data: report.data,
      branding: {
        name: agency?.name ?? "Agency",
        brand_color: agency?.brand_color ?? "#4f46e5",
        website: agency?.website ?? null,
        footer_text: agency?.footer_text ?? null,
        contact_email: agency?.contact_email ?? null,
        logo_url: agency?.logo_url ?? null,
      },
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
