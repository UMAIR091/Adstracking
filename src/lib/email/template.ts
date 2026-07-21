// The white-label report email. Table-based HTML with inline styles (the only
// thing email clients render reliably), built entirely from the agency's
// branding — logo, name, color, footer — with no platform branding anywhere.
// Every dynamic value is HTML-escaped; URLs additionally get a scheme check so
// a stored value can't inject a javascript: link.

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const safeUrl = (u: string | null | undefined): string | null => {
  const v = (u ?? "").trim();
  return /^https?:\/\//i.test(v) ? v : null;
};

const safeColor = (c: string | null | undefined): string =>
  c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : "#4f46e5";

export type ReportEmailArgs = {
  agencyName: string;
  brandColor: string;
  logoUrl?: string | null;
  websiteUrl?: string | null;
  clientName: string;
  reportTitle: string;
  periodLabel: string;
  shareUrl: string;
  /** Direct PDF download; omitted → the "Download PDF" link is not rendered. */
  pdfUrl?: string | null;
  /** AI executive summary, shown as the body of the email when present. */
  aiSummary?: string | null;
  /** Custom message from the schedule; takes precedence over the AI summary intro. */
  message?: string | null;
  /** Closing line configured in Email Branding (agencies.email_footer). */
  footerText?: string | null;
};

export function reportEmailHtml(args: ReportEmailArgs): string {
  const color = safeColor(args.brandColor);
  const agency = esc(args.agencyName || "Your Agency");
  const logo = safeUrl(args.logoUrl);
  const website = safeUrl(args.websiteUrl);
  const share = safeUrl(args.shareUrl) ?? "#";
  const pdf = safeUrl(args.pdfUrl);

  const greeting = `Hi ${esc(args.clientName)},`;
  const intro = args.message
    ? esc(args.message.trim())
    : `Your latest performance report is ready — here's how things looked over ${esc(args.periodLabel)}.`;

  // The AI summary is plain text from our own generation pipeline; escape it
  // and keep it to a readable length for an email body.
  const summary = (args.aiSummary ?? "").trim();
  const summaryBlock = summary
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
        <tr><td style="background:#f8fafc;border:1px solid #e9edf2;border-left:4px solid ${color};border-radius:10px;padding:16px 18px;">
          <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;">Summary</p>
          <p style="margin:0;font-size:14px;line-height:1.65;color:#334155;">${esc(summary.length > 700 ? `${summary.slice(0, 699)}…` : summary)}</p>
        </td></tr>
      </table>`
    : "";

  const header = logo
    ? `<img src="${esc(logo)}" alt="${agency}" height="36" style="display:block;max-height:36px;width:auto;border:0;" />`
    : `<span style="font-size:18px;font-weight:700;color:#ffffff;">${agency}</span>`;

  const pdfLink = pdf
    ? `<p style="margin:14px 0 0;font-size:13px;color:#64748b;">
         Prefer a file? <a href="${esc(pdf)}" style="color:${color};font-weight:600;text-decoration:none;">Download the PDF</a>
         &nbsp;·&nbsp; it's also attached to this email.
       </p>`
    : `<p style="margin:14px 0 0;font-size:13px;color:#64748b;">The full report is also attached to this email as a PDF.</p>`;

  const footerBits = [
    args.footerText ? esc(args.footerText.trim()) : null,
    website ? `<a href="${esc(website)}" style="color:#94a3b8;text-decoration:underline;">${esc(website.replace(/^https?:\/\//i, ""))}</a>` : null,
  ].filter(Boolean);

  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;">${esc(args.reportTitle)} — ${esc(args.periodLabel)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:36px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e9edf2;">
          <tr><td style="background:${color};padding:22px 32px;">${header}</td></tr>
          <tr><td style="padding:32px 32px 8px;">
            <h1 style="margin:0 0 4px;font-size:20px;line-height:1.35;color:#0f172a;">${esc(args.reportTitle)}</h1>
            <p style="margin:0 0 20px;font-size:13px;color:#64748b;">${esc(args.periodLabel)}</p>
            <p style="margin:0 0 10px;font-size:15px;color:#0f172a;font-weight:600;">${greeting}</p>
            <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#334155;">${intro}</p>
            ${summaryBlock}
            <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:10px;background:${color};">
              <a href="${esc(share)}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">View your report</a>
            </td></tr></table>
            ${pdfLink}
          </td></tr>
          <tr><td style="padding:22px 32px 28px;">
            <p style="margin:0;font-size:12px;color:#94a3b8;">If the button doesn't work, copy this link:<br/><span style="color:#64748b;word-break:break-all;">${esc(share)}</span></p>
          </td></tr>
          <tr><td style="padding:18px 32px;border-top:1px solid #eef1f5;">
            <p style="margin:0;font-size:12px;line-height:1.7;color:#94a3b8;">
              Prepared by <span style="font-weight:600;color:#64748b;">${agency}</span>${footerBits.length ? `<br/>${footerBits.join(" &nbsp;·&nbsp; ")}` : ""}
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}
