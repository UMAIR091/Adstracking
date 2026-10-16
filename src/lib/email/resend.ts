// Resend implementation of the EmailProvider interface. Pure REST (no SDK),
// mirroring the google.ts helper style used across the codebase.
import type { DnsRecord, EmailProvider, SendEmailArgs, SendResult, SendingDomain } from "./types";

const API = "https://api.resend.com";

export class ResendApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = "ResendApiError";
  }
}

function apiKey(): string {
  const k = process.env.RESEND_API_KEY;
  if (!k) throw new Error("Email is not configured (RESEND_API_KEY).");
  return k;
}

async function resend<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    // Resend errors: { statusCode, name, message }. The message is surfaced;
    // the name is kept on the error so callers can act on a specific one.
    const body = await res.text().catch(() => "");
    let detail = `HTTP ${res.status}`;
    let code: string | undefined;
    try {
      const parsed = JSON.parse(body) as { message?: string; name?: string };
      detail = parsed.message ?? detail;
      code = parsed.name;
    } catch { /* keep status */ }
    throw new ResendApiError(`Resend: ${detail}`, res.status, code);
  }
  return (await res.json()) as T;
}

type ResendDomain = {
  id: string;
  name: string;
  status: string;
  region?: string;
  records?: {
    record: string; name: string; type: string; value: string;
    ttl?: string; priority?: number; status?: string;
  }[];
};

function toSendingDomain(d: ResendDomain): SendingDomain {
  const records: DnsRecord[] = (d.records ?? []).map((r) => ({
    record: r.record, name: r.name, type: r.type, value: r.value,
    ttl: r.ttl, priority: r.priority, status: r.status,
  }));
  return { id: d.id, name: d.name, status: d.status, records, region: d.region };
}

export const resendProvider: EmailProvider = {
  id: "resend",

  isConfigured() {
    return Boolean(process.env.RESEND_API_KEY);
  },

  async send(args: SendEmailArgs): Promise<SendResult> {
    let data: { id: string };
    try {
      data = await resend<{ id: string }>("/emails", {
        method: "POST",
        ...(args.idempotencyKey ? { headers: { "Idempotency-Key": args.idempotencyKey.slice(0, 256) } } : {}),
        body: JSON.stringify({
          from: args.from,
          to: Array.isArray(args.to) ? args.to : [args.to],
          subject: args.subject,
          html: args.html,
          reply_to: args.replyTo,
          attachments: args.attachments,
        }),
      });
    } catch (err) {
      // The key was already used by an earlier attempt of this same delivery:
      // that attempt's email stands, and this one must not go out. (A key in
      // flight is "concurrent_idempotent_requests", which stays an error so
      // the retry loop tries again.)
      if (err instanceof ResendApiError && err.code === "invalid_idempotent_request") return { id: "", duplicate: true };
      throw err;
    }
    return { id: data.id };
  },

  async createDomain(name: string) {
    return toSendingDomain(await resend<ResendDomain>("/domains", {
      method: "POST",
      body: JSON.stringify({ name }),
    }));
  },

  async getDomain(id: string) {
    return toSendingDomain(await resend<ResendDomain>(`/domains/${encodeURIComponent(id)}`));
  },

  async verifyDomain(id: string) {
    await resend<{ id: string }>(`/domains/${encodeURIComponent(id)}/verify`, { method: "POST" });
  },

  async deleteDomain(id: string) {
    await resend<{ id: string }>(`/domains/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
};
