// Email delivery via the Resend REST API. Pure HTTP (no SDK dependency), mirrors
// the google.ts helper style. Gated by RESEND_API_KEY + EMAIL_FROM.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

// Whether email delivery is switched on. When false, callers should surface a
// clear "email not configured" message instead of attempting to send.
export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export type EmailAttachment = { filename: string; content: string }; // content = base64

export async function sendEmail(args: {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
}): Promise<{ id: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) throw new Error("Email is not configured (RESEND_API_KEY / EMAIL_FROM).");

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: Array.isArray(args.to) ? args.to : [args.to],
      subject: args.subject,
      html: args.html,
      reply_to: args.replyTo,
      attachments: args.attachments,
    }),
  });
  if (!res.ok) throw new Error(`Email send failed: ${await res.text()}`);
  const data = await res.json();
  return { id: data.id as string };
}

// Sends with simple exponential backoff. Returns the attempt count alongside the
// result so callers can record it in the delivery log. Throws after the last
// attempt; the caller records the failure.
export async function sendEmailWithRetry(
  args: Parameters<typeof sendEmail>[0],
  maxAttempts = 3
): Promise<{ id: string; attempts: number }> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { id } = await sendEmail(args);
      return { id, attempts: attempt };
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 400 * attempt));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Email send failed");
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Branded, white-label report email. Uses the agency's name and brand color so
// the client never sees ReportFlow.
export function reportEmailHtml(args: {
  agencyName: string;
  brandColor: string;
  clientName: string;
  reportTitle: string;
  periodLabel: string;
  shareUrl: string;
  message?: string | null;
}): string {
  const color = /^#[0-9a-fA-F]{6}$/.test(args.brandColor) ? args.brandColor : "#4f46e5";
  const agency = esc(args.agencyName || "Your Agency");
  const intro = args.message
    ? esc(args.message)
    : `Hi ${esc(args.clientName)}, your latest performance report is ready. Here's a quick, clear summary of how your organic search and website performed over ${esc(args.periodLabel)}.`;

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;padding:32px 0;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e9edf2;">
          <tr><td style="background:${color};padding:28px 32px;color:#ffffff;font-size:18px;font-weight:600;">${agency}</td></tr>
          <tr><td style="padding:32px;">
            <h1 style="margin:0 0 8px;font-size:20px;color:#0f172a;">${esc(args.reportTitle)}</h1>
            <p style="margin:0 0 20px;font-size:13px;color:#64748b;">${esc(args.periodLabel)}</p>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#334155;">${intro}</p>
            <a href="${esc(args.shareUrl)}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px;">View your report →</a>
            <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;">Or copy this link: <br><span style="color:#64748b;">${esc(args.shareUrl)}</span></p>
          </td></tr>
          <tr><td style="padding:18px 32px;border-top:1px solid #eef1f5;font-size:12px;color:#94a3b8;">Prepared by ${agency}.</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}
