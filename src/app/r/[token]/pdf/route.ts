import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrRenderReportPdf } from "@/lib/pdf/cache";
import { loadReportForRender } from "@/lib/reports/branding";
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

  const report = await loadReportForRender(admin, { shareToken: params.token });
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });

  try {
    const pdf = await getOrRenderReportPdf(
      admin,
      { id: report.id, pdf_cached_hash: report.pdfCachedHash },
      {
        data: report.data,
        branding: report.branding,
        clientName: report.clientName,
        title: report.title,
        period: report.period,
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
