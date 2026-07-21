// Sender resolution: decides, per send, whether an email goes out white-label
// (from the agency's own verified domain) or from the platform default.
//
// This is the enforcement point for domain security. The agency-editable
// settings (email_sender_email etc.) are treated as a request only — the
// stored value is re-validated against the agency's *verified* email_domains
// row on every send. White-label applies iff:
//
//   1. the agency has an email_domains row whose status is 'verified', and
//   2. the configured sender email is on exactly that domain.
//
// Everything else — no domain, unverified domain, sender on a different
// domain — falls back to the platform sender. Reports always deliver; only
// the from-identity degrades. That both prevents spoofing (you can never send
// as a domain you didn't verify via DNS) and prevents a lapsed DNS record
// from silently killing scheduled reports.
import type { SupabaseClient } from "@supabase/supabase-js";

export type ResolvedSender = {
  /** RFC 5322 from, e.g. `ABC Marketing <reports@agency.com>`. */
  from: string;
  replyTo?: string;
  whiteLabel: boolean;
  fromEmail: string;
  fromDomain: string;
};

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export function domainOfEmail(email: string): string | null {
  const at = email.lastIndexOf("@");
  return at === -1 ? null : email.slice(at + 1).trim().toLowerCase();
}

// Display names go into an RFC 5322 quoted-string; strip the characters that
// could break out of it rather than attempting full quoting.
function safeDisplayName(name: string): string {
  return name.replace(/[\r\n"<>]/g, "").trim().slice(0, 80) || "Reports";
}

function formatFrom(name: string, email: string): string {
  return `${safeDisplayName(name)} <${email}>`;
}

// The platform sender used when white-label isn't active. EMAIL_FROM may be
// either a bare address or a full `Name <addr>` string.
function platformSender(displayName: string): ResolvedSender | null {
  const raw = (process.env.EMAIL_FROM ?? "").trim();
  if (!raw) return null;
  const m = raw.match(/<([^>]+)>/);
  const email = (m ? m[1] : raw).trim();
  const from = m && !displayName ? raw : formatFrom(displayName || raw.replace(/<[^>]+>/, "").trim(), email);
  return {
    from,
    replyTo: process.env.EMAIL_REPLY_TO?.trim() || undefined,
    whiteLabel: false,
    fromEmail: email,
    fromDomain: domainOfEmail(email) ?? "",
  };
}

// Resolves the sender for an agency. Returns null only when email is entirely
// unconfigured (no EMAIL_FROM) — callers already gate on emailConfigured().
export async function resolveSender(supabase: SupabaseClient, agencyId: string): Promise<ResolvedSender | null> {
  const [{ data: agency }, { data: domainRow }] = await Promise.all([
    supabase
      .from("agencies")
      .select("name, contact_email, email_sender_name, email_sender_email, email_reply_to")
      .eq("id", agencyId)
      .maybeSingle(),
    supabase
      .from("email_domains")
      .select("domain, status")
      .eq("agency_id", agencyId)
      .maybeSingle(),
  ]);

  const displayName = (agency?.email_sender_name as string | null)?.trim() || (agency?.name as string | null)?.trim() || "";
  const replyTo =
    (agency?.email_reply_to as string | null)?.trim() ||
    (agency?.contact_email as string | null)?.trim() ||
    undefined;

  const senderEmail = (agency?.email_sender_email as string | null)?.trim().toLowerCase() ?? "";
  const verifiedDomain = domainRow?.status === "verified" ? (domainRow.domain as string).toLowerCase() : null;

  // The white-label gate: valid address, on the agency's own verified domain.
  if (verifiedDomain && EMAIL_RE.test(senderEmail) && domainOfEmail(senderEmail) === verifiedDomain) {
    return {
      from: formatFrom(displayName, senderEmail),
      replyTo,
      whiteLabel: true,
      fromEmail: senderEmail,
      fromDomain: verifiedDomain,
    };
  }

  const fallback = platformSender(displayName);
  if (!fallback) return null;
  // Agency-configured reply-to applies in default mode too, so replies reach
  // the agency even when sending from the platform domain.
  return { ...fallback, replyTo: replyTo ?? fallback.replyTo };
}
