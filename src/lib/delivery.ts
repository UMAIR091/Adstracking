// Central report-delivery pipeline: render the branded PDF, record delivery
// history (pending → sent/failed) with retry, and email it as an attachment.
// Shared by the manual send route, "Send Now"/"Send Test", and the cron.
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmailWithRetry, reportEmailHtml } from "@/lib/email";
import { renderReportPdf } from "@/lib/pdf";

export type DeliveryBranding = {
  name: string;
  brand_color: string;
  website: string | null;
  footer_text: string | null;
  contact_email?: string | null;
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

// Delivers a report by email with a PDF attachment. Writes one email_logs row
// per recipient: 'pending' up front, then 'sent' (with provider id + attempts)
// or 'failed' (with the error). Never throws — returns a result.
export async function deliverReport(supabase: SupabaseClient, input: DeliverInput): Promise<{ ok: boolean; error?: string; sent: number }> {
  const { agencyId, branding, clientName, recipients, subject, report } = input;
  if (recipients.length === 0) return { ok: false, error: "No recipients", sent: 0 };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const shareUrl = `${appUrl}/r/${report.shareToken}`;
  const periodLabel = `${report.period.start} – ${report.period.end}`;

  // Pre-log as pending so in-flight deliveries show in history.
  const { data: logs } = await supabase
    .from("email_logs")
    .insert(recipients.map((to) => ({ agency_id: agencyId, report_id: report.id, to_email: to, subject, status: "pending", report_url: shareUrl })))
    .select("id");
  const logIds = (logs ?? []).map((l) => l.id);

  try {
    const pdf = await renderReportPdf({ data: report.data, branding, clientName, title: report.title, period: report.period });
    const html = reportEmailHtml({
      agencyName: branding.name,
      brandColor: branding.brand_color,
      clientName,
      reportTitle: report.title,
      periodLabel,
      shareUrl,
      message: input.message,
    });

    const { id: providerId, attempts } = await sendEmailWithRetry({
      to: recipients,
      subject,
      html,
      replyTo: branding.contact_email ?? undefined,
      attachments: [{ filename: `${slug(report.title)}.pdf`, content: pdf.toString("base64") }],
    });

    if (logIds.length) {
      await supabase.from("email_logs")
        .update({ status: "sent", provider_id: providerId, attempts, sent_at: new Date().toISOString() })
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
