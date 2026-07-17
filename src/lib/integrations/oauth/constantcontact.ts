// Constant Contact backend (v3 API). OAuth 2.0 with a Basic-authed token
// endpoint; offline_access yields the refresh token the shared refresh flow
// needs (access tokens live ~2h). A connection maps to one Constant Contact
// account. Metrics normalize into the shared EmailReport (EmailAnalytics), the
// same shape Mailchimp/Klaviyo/ActiveCampaign fill — no new visualization code.
//
// NOTE ON VERIFICATION: campaign summaries are joined from two v3 endpoints
// (/emails for names+dates, /reports/summary_reports/email_campaign_summaries
// for counts); parsing is defensive and worth confirming on a live account.
import type { IntegrationAccount, OAuthProvider, TokenSet } from "../types";
import { dayRange, ratio, withRetry, type EmailCampaign, type EmailDay, type EmailReport, type EmailTotals } from "../metrics";

const AUTHZ = "https://authz.constantcontact.com/oauth2/default/v1";
const API = "https://api.cc.email/v3";
// offline_access is required to receive a refresh token.
const SCOPES = ["contact_data", "campaign_data", "offline_access"];

function env(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`${key} is not set`);
  return v;
}

export function constantContactConfigured(): boolean {
  return Boolean(process.env.CONSTANT_CONTACT_CLIENT_ID && process.env.CONSTANT_CONTACT_CLIENT_SECRET);
}

function redirectUri(): string {
  return `${env("NEXT_PUBLIC_APP_URL")}/api/constantcontact/callback`;
}

function basicAuth(): string {
  return Buffer.from(`${env("CONSTANT_CONTACT_CLIENT_ID")}:${env("CONSTANT_CONTACT_CLIENT_SECRET")}`).toString("base64");
}

async function ccGet<T>(accessToken: string, path: string, params?: Record<string, string>): Promise<T> {
  return withRetry(async () => {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : "";
    const res = await fetch(`${API}${path}${qs}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    if (res.status === 429) throw new Error("Constant Contact rate limit (429)");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = (data as { error_message?: string }[] | { error_message?: string }) instanceof Array
        ? (data as { error_message?: string }[])[0]?.error_message
        : (data as { error_message?: string }).error_message;
      throw new Error(`Constant Contact API error: ${detail ?? res.statusText} (${res.status})`);
    }
    return data as T;
  });
}

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number };

async function tokenRequest(body: Record<string, string>): Promise<TokenSet> {
  const res = await fetch(`${AUTHZ}/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(body).toString(),
  });
  const data = (await res.json().catch(() => ({}))) as TokenResponse & { error_description?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(`Constant Contact token request failed: ${data.error_description ?? res.statusText} (${res.status})`);
  }
  return { access_token: data.access_token, refresh_token: data.refresh_token, expires_in: data.expires_in ?? 7200 };
}

export const constantContactOAuth: OAuthProvider = {
  id: "constantcontact",
  authUrl(state) {
    const params = new URLSearchParams({
      client_id: env("CONSTANT_CONTACT_CLIENT_ID"),
      redirect_uri: redirectUri(),
      response_type: "code",
      scope: SCOPES.join(" "),
      state,
    });
    return `${AUTHZ}/authorize?${params.toString()}`;
  },
  exchangeCode(code) {
    return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri() });
  },
  async refresh(refreshToken) {
    const tokens = await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
    return { ...tokens, refresh_token: tokens.refresh_token ?? refreshToken };
  },
  async identity(accessToken) {
    try {
      const acc = await accountSummary(accessToken);
      return acc.name;
    } catch {
      return "Constant Contact account";
    }
  },
  callbackPath: "/api/constantcontact/callback",
};

type AccountSummary = { encoded_account_id?: string; organization_name?: string; contact_email?: string };

async function accountSummary(accessToken: string): Promise<{ id: string; name: string }> {
  const data = await ccGet<AccountSummary>(accessToken, "/account/summary");
  return {
    id: data.encoded_account_id ?? "account",
    name: data.organization_name ?? data.contact_email ?? "Constant Contact account",
  };
}

// A connection maps to exactly one Constant Contact account.
export async function listConstantContactAccounts(accessToken: string): Promise<IntegrationAccount[]> {
  const acc = await accountSummary(accessToken);
  return [{ id: acc.id, name: acc.name }];
}

type EmailCampaignItem = { campaign_id?: string; name?: string; current_status?: string; last_sent_date?: string; updated_at?: string };
type CampaignSummary = {
  campaign_id?: string;
  unique_counts?: { sends?: number; opens?: number; clicks?: number; optouts?: number; bounces?: number };
};

const n = (v: number | string | undefined): number => {
  const x = typeof v === "string" ? Number(v) : v;
  return typeof x === "number" && Number.isFinite(x) ? x : 0;
};

async function contactCount(accessToken: string, params: Record<string, string>): Promise<number> {
  const data = await ccGet<{ contacts_count?: number }>(accessToken, "/contacts", {
    limit: "1",
    include_count: "true",
    status: "all",
    ...params,
  });
  return n(data.contacts_count);
}

// Joins campaign names/dates (/emails) with their counts (summary reports).
async function sentCampaigns(accessToken: string): Promise<{ name: string; date: string; counts: CampaignSummary["unique_counts"] }[]> {
  const [emails, summaries] = await Promise.all([
    ccGet<{ campaigns?: EmailCampaignItem[] }>(accessToken, "/emails", { limit: "50" }).catch(() => ({ campaigns: [] as EmailCampaignItem[] })),
    ccGet<{ bulk_email_campaign_summaries?: CampaignSummary[] }>(
      accessToken, "/reports/summary_reports/email_campaign_summaries", { limit: "50" }
    ).catch(() => ({ bulk_email_campaign_summaries: [] as CampaignSummary[] })),
  ]);
  const meta = new Map((emails.campaigns ?? []).map((c) => [c.campaign_id, c]));
  return (summaries.bulk_email_campaign_summaries ?? []).map((s) => {
    const m = meta.get(s.campaign_id);
    return {
      name: m?.name ?? s.campaign_id ?? "—",
      date: (m?.last_sent_date ?? m?.updated_at ?? "").slice(0, 10),
      counts: s.unique_counts,
    };
  });
}

function totalsFrom(rows: { counts: CampaignSummary["unique_counts"] }[], subscribers: number, newSubscribers: number): EmailTotals {
  const emailsSent = rows.reduce((s, r) => s + n(r.counts?.sends), 0);
  const opens = rows.reduce((s, r) => s + n(r.counts?.opens), 0);
  const clicks = rows.reduce((s, r) => s + n(r.counts?.clicks), 0);
  return {
    subscribers,
    newSubscribers,
    unsubscribes: rows.reduce((s, r) => s + n(r.counts?.optouts), 0),
    campaigns: rows.length,
    emailsSent,
    opens,
    openRate: ratio(opens, emailsSent),
    clicks,
    clickRate: ratio(clicks, emailsSent),
  };
}

// Fetches the normalized email report for the account and period, plus the prior
// equal-length period for comparison.
export async function fetchConstantContactReport(accessToken: string, _accountId: string, periodDays: number): Promise<EmailReport> {
  const days = dayRange(periodDays);
  const since = days[0];
  const prevSince = dayRange(periodDays * 2)[0];

  const [subscribers, newSubscribers, all] = await Promise.all([
    contactCount(accessToken, {}).catch(() => 0),
    contactCount(accessToken, { created_after: `${since}T00:00:00Z` }).catch(() => 0),
    sentCampaigns(accessToken).catch(() => [] as Awaited<ReturnType<typeof sentCampaigns>>),
  ]);

  const inPeriod = all.filter((c) => c.date >= since);
  const inPrev = all.filter((c) => c.date >= prevSince && c.date < since);

  // No daily series endpoint — bucket each campaign onto its send date.
  const byDay = new Map<string, EmailDay>();
  for (const d of days) byDay.set(d, { date: d, sent: 0, opens: 0, clicks: 0 });
  for (const c of inPeriod) {
    const day = byDay.get(c.date);
    if (!day) continue;
    day.sent += n(c.counts?.sends);
    day.opens += n(c.counts?.opens);
    day.clicks += n(c.counts?.clicks);
  }

  const topCampaigns: EmailCampaign[] = inPeriod
    .map((c) => {
      const sent = n(c.counts?.sends);
      return {
        name: c.name,
        sentAt: c.date,
        sent,
        openRate: ratio(n(c.counts?.opens), sent),
        clickRate: ratio(n(c.counts?.clicks), sent),
      };
    })
    .sort((a, b) => b.sent - a.sent)
    .slice(0, 10);

  return {
    platform: "constantcontact",
    totals: totalsFrom(inPeriod, subscribers, newSubscribers),
    previousTotals: inPrev.length ? totalsFrom(inPrev, subscribers, 0) : null,
    byDate: Array.from(byDay.values()),
    topCampaigns,
  };
}
