// Central report-delivery pipeline: render the branded PDF, resolve the
// sender (white-label vs platform fallback), record delivery history
// (pending → sent/failed) with retry, and email it as an attachment.
// Shared by the manual send route, "Send Now"/"Send Test", and the cron.
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmailWithRetry, reportEmailHtml, resolveSender, type ResolvedSender } from "@/lib/email";
import { renderReportPdf } from "@/lib/pdf";
import { normalizeReportData } from "@/lib/report";

export type DeliveryBranding = {
  name: string;
  brand_color: string;
  website: string | null;
  footer_text: string | null;
  contact_email?: string | null;
  logo_url?: string | null;
  /** Email Branding closing line (agencies.email_footer). */
  email_footer?: string | null;
};

export type DeliverInput = {
  agencyId: string;
  branding: DeliveryBranding;
  clientName: string;
  recipients: string[];
  subject: string;
  message?: string | null;
  report: { id: string; title: string; shareToken: string; data: unknown; period: { start: string; end: string } };
};

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "report";
}

// The AI executive summary baked into the report snapshot, for the email body.
function summaryOf(data: unknown): string | null {
  try {
    const { insights } = normalizeReportData(data);
    const ins = insights as { executiveSummary?: string; summary?: string } | null;
    const text = ins?.executiveSummary ?? ins?.summary ?? "";
    return typeof text === "string" && text.trim() ? text.trim() : null;
  } catch {
    return null;
  }
}

// Delivers a report by email with a PDF attachment. Writes one email_logs row
// per recipient: 'pending' up front, then 'sent' (with provider id, attempts
// and the sender actually used) or 'failed' (with the error). Never throws —
// returns a result.
export async function deliverReport(supabase: SupabaseClient, input: DeliverInput): Promise<{ ok: boolean; error?: string; sent: number }> {
  const { agencyId, branding, clientName, recipients, subject, report } = input;
  if (recipients.length === 0) return { ok: false, error: "No recipients", sent: 0 };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const shareUrl = `${appUrl}/r/${report.shareToken}`;
  const pdfUrl = `${shareUrl}/pdf`;
  const periodLabel = `${report.period.start} – ${report.period.end}`;

  // Pre-log as pending so in-flight deliveries show in history.
  const { data: logs } = await supabase
    .from("email_logs")
    .insert(recipients.map((to) => ({ agency_id: agencyId, report_id: report.id, to_email: to, subject, status: "pending", report_url: shareUrl })))
    .select("id");
  const logIds = (logs ?? []).map((l) => l.id);

  try {
    // White-label sender when the agency's domain is verified and the sender
    // address is on it; the platform sender otherwise. Never null when
    // emailConfigured() gated the caller, but guard anyway.
    const sender = await resolveSender(supabase, agencyId);
    if (!sender) throw new Error("Email is not configured (EMAIL_FROM).");

    const pdf = await renderReportPdf({ data: report.data, branding, clientName, title: report.title, period: report.period });
    const html = reportEmailHtml({
      agencyName: branding.name,
      brandColor: branding.brand_color,
      logoUrl: branding.logo_url,
      websiteUrl: branding.website,
      clientName,
      reportTitle: report.title,
      periodLabel,
      shareUrl,
      pdfUrl,
      aiSummary: summaryOf(report.data),
      message: input.message,
      footerText: branding.email_footer ?? branding.footer_text,
    });

    const sendArgs = {
      to: recipients,
      subject,
      html,
      replyTo: sender.replyTo,
      attachments: [{ filename: `${slug(report.title)}.pdf`, content: pdf.toString("base64") }],
    };

    // Send white-label first; if that fails after retries (e.g. the domain
    // lost verification since we checked), fall back to the platform sender so
    // the scheduled report still reaches the client. The log records which
    // identity actually went out.
    let used: ResolvedSender = sender;
    let outcome: { id: string; attempts: number };
    try {
      outcome = await sendEmailWithRetry({ ...sendArgs, from: sender.from });
    } catch (err) {
      const fallback = await resolveSenderFallback(supabase, agencyId);
      if (!sender.whiteLabel || !fallback) throw err;
      console.warn(`White-label send failed for agency ${agencyId} (${(err as Error).message}) — retrying with platform sender.`);
      used = fallback;
      outcome = await sendEmailWithRetry({ ...sendArgs, from: fallback.from, replyTo: fallback.replyTo }, 2);
    }

    if (logIds.length) {
      await supabase.from("email_logs")
        .update({
          status: "sent",
          provider_id: outcome.id,
          attempts: outcome.attempts,
          from_email: used.fromEmail,
          from_domain: used.fromDomain,
          sent_at: new Date().toISOString(),
        })
        .in("id", logIds);
    }
    return { ok: true, sent: recipients.length };
  } catch (err) {
    const message = (err as Error).message;
    if (logIds.length) {
      await supabase.from("email_logs").update({ status: "failed", error: message.slice(0, 500), attempts: 3 }).in("id", logIds);
    }
    return { ok: false, error: message, sent: 0 };
  }
}

// The platform-default sender, ignoring the agency's white-label settings.
// Used only as the second leg of the white-label → default fallback.
async function resolveSenderFallback(supabase: SupabaseClient, agencyId: string): Promise<ResolvedSender | null> {
  const raw = (process.env.EMAIL_FROM ?? "").trim();
  if (!raw) return null;
  const { data: agency } = await supabase
    .from("agencies")
    .select("name, contact_email, email_sender_name, email_reply_to")
    .eq("id", agencyId)
    .maybeSingle();
  const m = raw.match(/<([^>]+)>/);
  const email = (m ? m[1] : raw).trim();
  const name = ((agency?.email_sender_name as string | null) || (agency?.name as string | null) || "").replace(/[\r\n"<>]/g, "").trim();
  return {
    from: name ? `${name} <${email}>` : raw,
    replyTo:
      (agency?.email_reply_to as string | null)?.trim() ||
      (agency?.contact_email as string | null)?.trim() ||
      process.env.EMAIL_REPLY_TO?.trim() ||
      undefined,
    whiteLabel: false,
    fromEmail: email,
    fromDomain: email.slice(email.lastIndexOf("@") + 1).toLowerCase(),
  };
}
