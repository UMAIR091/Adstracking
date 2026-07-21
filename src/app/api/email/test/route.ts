import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { emailConfigured, reportEmailHtml, resolveSender, sendEmailWithRetry } from "@/lib/email";

export const runtime = "nodejs";

// Sends a branded test email so an agency can confirm their setup before
// enabling scheduled reports.
//
// It deliberately runs the *real* send path — resolveSender() decides
// white-label vs fallback exactly as a scheduled report would — so a passing
// test means scheduled delivery will use the same identity. The response
// reports which sender was used, making a silent fallback visible rather than
// letting the agency believe white-label is active when it isn't.
//
// The recipient is always the signed-in user's own address: a tester that
// could email arbitrary recipients would be an open relay.
export async function POST() {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!emailConfigured()) {
    return NextResponse.json(
      { error: "Email isn't configured on the platform yet. Contact support." },
      { status: 503 }
    );
  }
  if (!user.email) {
    return NextResponse.json({ error: "Your account has no email address to send a test to." }, { status: 400 });
  }

  const supabase = createClient();

  // Basic abuse guard: one test per agency per minute, counted from the
  // delivery log rather than memory so it survives serverless cold starts.
  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
  const { count } = await supabase
    .from("email_logs")
    .select("id", { count: "exact", head: true })
    .eq("agency_id", agency.id)
    .is("report_id", null)
    .gte("sent_at", oneMinuteAgo);
  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: "Please wait a minute before sending another test." }, { status: 429 });
  }

  const sender = await resolveSender(supabase, agency.id);
  if (!sender) return NextResponse.json({ error: "Email is not configured (EMAIL_FROM)." }, { status: 503 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const subject = `Test email from ${agency.name || "your agency"}`;

  const html = reportEmailHtml({
    agencyName: agency.name || "Your Agency",
    brandColor: agency.brand_color || "#4f46e5",
    logoUrl: agency.logo_url,
    websiteUrl: agency.website,
    clientName: user.email.split("@")[0],
    reportTitle: "Email setup test",
    periodLabel: "Test message",
    shareUrl: `${appUrl}/dashboard/settings`,
    // Stands in for the AI summary so the agency sees the real layout.
    aiSummary: sender.whiteLabel
      ? `White-label sending is working. This email was sent from ${sender.fromEmail} using your verified domain ${sender.fromDomain}, so your clients will never see ReportFlow in the sender. Scheduled reports will arrive exactly like this, with the PDF attached.`
      : `Your email setup works, but this was sent from the default sender (${sender.fromEmail}) rather than your own domain. Add and verify your sending domain in Email branding to send from your own address.`,
    message: "This is a test of your report email setup — no client has received it.",
    footerText: agency.email_footer ?? agency.footer_text,
  });

  // Log it like any other delivery (report_id null marks it as a test).
  const { data: log } = await supabase
    .from("email_logs")
    .insert({
      agency_id: agency.id,
      report_id: null,
      to_email: user.email,
      subject,
      status: "pending",
    })
    .select("id")
    .maybeSingle();

  try {
    const { id, attempts } = await sendEmailWithRetry({
      from: sender.from,
      to: user.email,
      subject,
      html,
      replyTo: sender.replyTo,
    });

    if (log?.id) {
      await supabase
        .from("email_logs")
        .update({
          status: "sent",
          provider_id: id,
          attempts,
          from_email: sender.fromEmail,
          from_domain: sender.fromDomain,
          sent_at: new Date().toISOString(),
        })
        .eq("id", log.id);
    }

    return NextResponse.json({
      ok: true,
      sentTo: user.email,
      whiteLabel: sender.whiteLabel,
      from: sender.from,
      message: sender.whiteLabel
        ? `Test sent to ${user.email} from ${sender.fromEmail} — white-label is active.`
        : `Test sent to ${user.email} from the default sender (${sender.fromEmail}). Verify your own domain to send as your agency.`,
    });
  } catch (err) {
    const message = (err as Error).message;
    if (log?.id) {
      await supabase.from("email_logs").update({ status: "failed", error: message.slice(0, 500), attempts: 3 }).eq("id", log.id);
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
