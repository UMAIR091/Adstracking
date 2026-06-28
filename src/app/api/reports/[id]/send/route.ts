import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { emailConfigured, sendEmail, reportEmailHtml } from "@/lib/email";

export const runtime = "nodejs";

// Emails an existing report's shareable link to one or more recipients now.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!emailConfigured()) {
    return NextResponse.json(
      { error: "Email isn't configured yet. Add RESEND_API_KEY and EMAIL_FROM, then try again." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => null);

  const supabase = createClient();
  const { data: report } = await supabase
    .from("reports")
    .select("id, title, period_start, period_end, share_token, clients(name, email)")
    .eq("id", params.id)
    .maybeSingle();
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });

  const c = report.clients as unknown as { name: string | null; email: string | null } | { name: string | null; email: string | null }[] | null;
  const client = Array.isArray(c) ? c[0] : c;
  const clientName = client?.name ?? "Client";

  const fromBody: string[] = Array.isArray(body?.recipients) ? body.recipients.filter((e: unknown) => typeof e === "string" && e.includes("@")) : [];
  const recipients = fromBody.length ? fromBody : client?.email ? [client.email] : [];
  if (recipients.length === 0) {
    return NextResponse.json({ error: "No recipient email. Add the client's email or pass recipients." }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const shareUrl = `${appUrl}/r/${report.share_token}`;
  const periodLabel = `${report.period_start} – ${report.period_end}`;
  const subject = body?.subject || `${clientName} — your latest performance report`;

  const html = reportEmailHtml({
    agencyName: agency.name,
    brandColor: agency.brand_color,
    clientName,
    reportTitle: report.title,
    periodLabel,
    shareUrl,
    message: body?.message,
  });

  try {
    const { id: providerId } = await sendEmail({ to: recipients, subject, html, replyTo: agency.contact_email ?? undefined });
    await supabase.from("email_logs").insert(
      recipients.map((to) => ({
        agency_id: agency.id,
        report_id: report.id,
        to_email: to,
        subject,
        provider_id: providerId,
        status: "sent",
      }))
    );
    return NextResponse.json({ ok: true, sent: recipients.length });
  } catch (err) {
    const message = (err as Error).message;
    await supabase.from("email_logs").insert(
      recipients.map((to) => ({ agency_id: agency.id, report_id: report.id, to_email: to, subject, status: "failed" }))
    );
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
