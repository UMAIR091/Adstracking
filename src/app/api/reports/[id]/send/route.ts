import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { emailConfigured } from "@/lib/email";
import { deliverReport } from "@/lib/delivery";

export const runtime = "nodejs";
export const maxDuration = 60;

// Emails an existing report as a branded PDF attachment to one or more
// recipients now (defaults to the client's email).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!emailConfigured()) {
    return NextResponse.json({ error: "Email isn't configured yet. Add RESEND_API_KEY and EMAIL_FROM, then try again." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const supabase = createClient();
  const { data: report } = await supabase
    .from("reports")
    .select("id, title, period_start, period_end, data, share_token, clients(name, email)")
    .eq("id", params.id)
    .maybeSingle();
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });

  const c = report.clients as unknown as { name: string | null; email: string | null } | { name: string | null; email: string | null }[] | null;
  const client = Array.isArray(c) ? c[0] : c;
  const clientName = client?.name ?? "Client";

  const fromBody: string[] = Array.isArray(body?.recipients)
    ? body.recipients.filter((e: unknown) => typeof e === "string" && (e as string).includes("@")).slice(0, 10)
    : [];
  const recipients = fromBody.length ? fromBody : client?.email ? [client.email] : [];
  if (recipients.length === 0) {
    return NextResponse.json({ error: "No recipient email. Add the client's email or pass recipients." }, { status: 400 });
  }
  const subject = typeof body?.subject === "string" && body.subject.trim() ? body.subject.trim().slice(0, 200) : `${clientName} — your latest performance report`;
  const message = typeof body?.message === "string" ? body.message.trim().slice(0, 2000) || null : null;

  const result = await deliverReport(supabase, {
    agencyId: agency.id,
    branding: { name: agency.name, brand_color: agency.brand_color, website: agency.website, footer_text: agency.footer_text, contact_email: agency.contact_email },
    clientName,
    recipients,
    subject,
    message,
    report: { id: report.id, title: report.title, shareToken: report.share_token, data: report.data, period: { start: report.period_start as string, end: report.period_end as string } },
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ ok: true, sent: result.sent });
}
