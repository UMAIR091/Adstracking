import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { requireActiveAccess } from "@/lib/billing/subscription";
import { emailConfigured } from "@/lib/email";
import { deliverReport } from "@/lib/delivery";
import { loadReportForRender } from "@/lib/reports/branding";
import { rateLimit, tooManyRequests } from "@/lib/rateLimit";
import { publicError } from "@/lib/errors";

export const runtime = "nodejs";
export const maxDuration = 60;

// Emails an existing report as a branded PDF attachment to one or more
// recipients now (defaults to the client's email).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Bound per workspace: renders a PDF + sends email (cost + anti-spam).
  const rl = await rateLimit(`report-send:${agency.id}`, { limit: 30, windowSeconds: 60 });
  if (!rl.allowed) return tooManyRequests(rl.windowSeconds);

  if (!emailConfigured()) {
    return NextResponse.json({ error: "Email isn't configured yet. Add RESEND_API_KEY and EMAIL_FROM, then try again." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const supabase = createClient();
  const blocked = await requireActiveAccess(supabase, agency.id);
  if (blocked) return NextResponse.json({ error: blocked.error }, { status: blocked.status });

  // Branding and recipient both come from the report's own agency and client.
  const report = await loadReportForRender(supabase, { id: params.id }, agency.id);
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });
  const clientName = report.clientName;

  const fromBody: string[] = Array.isArray(body?.recipients)
    ? body.recipients.filter((e: unknown) => typeof e === "string" && (e as string).includes("@")).slice(0, 10)
    : [];
  const recipients = fromBody.length ? fromBody : report.clientEmail ? [report.clientEmail] : [];
  if (recipients.length === 0) {
    return NextResponse.json({ error: "No recipient email. Add the client's email or pass recipients." }, { status: 400 });
  }
  const subject = typeof body?.subject === "string" && body.subject.trim() ? body.subject.trim().slice(0, 200) : `${clientName} — your latest performance report`;
  const message = typeof body?.message === "string" ? body.message.trim().slice(0, 2000) || null : null;

  const result = await deliverReport(supabase, {
    // The report's own workspace, not the session's: this picks the sender
    // identity and files the delivery log, and both must match the branding
    // on the PDF that is being attached.
    agencyId: report.agencyId,
    branding: report.branding,
    clientName,
    clientLogoUrl: report.clientLogoUrl,
    recipients,
    subject,
    message,
    // A person clicked "Email report" — the timeline shows this as
    // "Report emailed", never "Scheduled report sent".
    source: "manual",
    actorId: user.id,
    report: { id: report.id, title: report.title, shareToken: report.shareToken ?? "", data: report.data, period: report.period },
  });

  if (!result.ok) {
    const { error } = publicError(result.error, "Couldn't send the report. Please try again.", { route: "reports_send", agencyId: agency.id });
    return NextResponse.json({ error }, { status: 502 });
  }
  return NextResponse.json({ ok: true, sent: result.sent });
}
