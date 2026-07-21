// Email delivery abstraction. One provider (Resend) is implemented today; the
// interface exists so a second one (Postmark, SES, …) is a new file plus a
// registry entry in index.ts — no changes to the delivery pipeline or UI.

export type EmailAttachment = { filename: string; content: string }; // content = base64

export type SendEmailArgs = {
  /** RFC 5322 from, e.g. `ABC Marketing <reports@agency.com>`. */
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
};

// The DNS records a sending domain requires. Shape mirrors what providers
// return so the UI can render them verbatim.
export type DnsRecord = {
  record: string;            // "SPF" | "DKIM" | "MX" | …
  name: string;              // host to create the record at
  type: string;              // "TXT" | "CNAME" | "MX"
  value: string;
  ttl?: string;
  priority?: number;
  status?: string;           // per-record verification state when provided
};

export type DomainStatus = "not_started" | "pending" | "verified" | "failed" | "temporary_failure";

export type SendingDomain = {
  id: string;                // provider's domain id
  name: string;              // "agency.com"
  status: DomainStatus | string;
  records: DnsRecord[];
  region?: string;
};

export interface EmailProvider {
  readonly id: string;
  /** True when the provider has credentials and can be used at all. */
  isConfigured(): boolean;
  send(args: SendEmailArgs): Promise<{ id: string }>;

  // Sending-domain lifecycle (white-label). Providers that can't manage
  // domains may throw from these; the UI is gated on isConfigured().
  createDomain(name: string): Promise<SendingDomain>;
  getDomain(id: string): Promise<SendingDomain>;
  /** Ask the provider to (re)check DNS. Follow with getDomain for fresh state. */
  verifyDomain(id: string): Promise<void>;
  deleteDomain(id: string): Promise<void>;
}
