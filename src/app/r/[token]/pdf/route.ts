import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrRenderReportPdf } from "@/lib/pdf/cache";
import { rateLimit, tooManyRequests, clientIp } from "@/lib/rateLimit";
import { publicError } from "@/lib/errors";

export const runtime = "nodejs";
export const maxDuration = 60;

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "report";
}

// Public PDF download for a shared report — accessed via the unguessable share
// token, the same access control as the public report page.
//
// Hardened (audit #3): IP rate-limited so the unauthenticated, compute-heavy
// render can't be used for cost-DoS, and served from a Storage cache so repeat
// downloads don't re-render. Legitimate viewers are unaffected (a generous
// per-minute allowance, and the first cached render makes later hits instant).
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const admin = createAdminClient();

  // 30 downloads / minute / IP: far above any human's cadence, well below abuse.
  const { allowed, windowSeconds } = await rateLimit(`pdf:${clientIp(req)}`, { limit: 30, windowSeconds: 60, client: admin });
  if (!allowed) return tooManyRequests(windowSeconds);

  const { data: report } = await admin
    .from("reports")
    .select("id, title, period_start, period_end, data, agency_id, pdf_cached_hash, clients(name)")
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
    const pdf = await getOrRenderReportPdf(
      admin,
      { id: report.id as string, pdf_cached_hash: (report.pdf_cached_hash as string | null) ?? null },
      {
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
        title: report.title as string,
        period: { start: report.period_start as string, end: report.period_end as string },
      }
    );
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${slug(report.title as string)}.pdf"`,
        // Allow the browser/CDN to reuse the download briefly without another hit.
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    const { error } = publicError(err, "Couldn't generate the PDF. Please try again.", { route: "public_pdf" });
    return NextResponse.json({ error }, { status: 500 });
  }
}
