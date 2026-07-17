// Campaign Monitor backend (API v3.3). OAuth 2.0 with refresh. Campaign Monitor
// nests "clients" under an account, so an account here is a Campaign Monitor
// client id — exactly the granularity an agency reports on. Metrics normalize
// into the shared EmailReport (EmailAnalytics), the same shape Mailchimp,
// Klaviyo, ActiveCampaign and Constant Contact fill — no new visualization code.
import type { IntegrationAccount, OAuthProvider, TokenSet } from "../types";
import { dayRange, ratio, withRetry, type EmailCampaign, type EmailDay, type EmailReport, type EmailTotals } from "../metrics";

const API = "https://api.createsend.com/api/v3.3";
const OAUTH_AUTHORIZE = "https://api.createsend.com/oauth";
const OAUTH_TOKEN = "https://api.createsend.com/oauth/token";
// Read-only reporting access.
const SCOPE = "ViewReports";
// Bound the per-sync fan-out: Campaign Monitor needs one call per campaign
// summary and one per list's stats.
const MAX_CAMPAIGNS = 20;
const MAX_LISTS = 10;

function env(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`${key} is not set`);
  return v;
}

export function campaignMonitorConfigured(): boolean {
  return Boolean(process.env.CAMPAIGN_MONITOR_CLIENT_ID && process.env.CAMPAIGN_MONITOR_CLIENT_SECRET);
}

function redirectUri(): string {
  return `${env("NEXT_PUBLIC_APP_URL")}/api/campaignmonitor/callback`;
}

async function cmGet<T>(accessToken: string, path: string): Promise<T> {
  return withRetry(async () => {
    const res = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    if (res.status === 429) throw new Error("Campaign Monitor rate limit (429)");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = (data as { Message?: string }).Message ?? res.statusText;
      throw new Error(`Campaign Monitor API error: ${detail} (${res.status})`);
    }
    return data as T;
  });
}

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number };

async function tokenRequest(body: Record<string, string>): Promise<TokenSet> {
  const res = await fetch(OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: env("CAMPAIGN_MONITOR_CLIENT_ID"),
      client_secret: env("CAMPAIGN_MONITOR_CLIENT_SECRET"),
      ...body,
    }).toString(),
  });
  const data = (await res.json().catch(() => ({}))) as TokenResponse & { error_description?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(`Campaign Monitor token request failed: ${data.error_description ?? res.statusText} (${res.status})`);
  }
  return { access_token: data.access_token, refresh_token: data.refresh_token, expires_in: data.expires_in ?? 1209600 };
}

export const campaignMonitorOAuth: OAuthProvider = {
  id: "campaignmonitor",
  authUrl(state) {
    const params = new URLSearchParams({
      client_id: env("CAMPAIGN_MONITOR_CLIENT_ID"),
      redirect_uri: redirectUri(),
      scope: SCOPE,
      state,
    });
    return `${OAUTH_AUTHORIZE}?${params.toString()}`;
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
      const clients = await cmGet<CmClient[]>(accessToken, "/clients.json");
      return clients[0]?.Name ?? "Campaign Monitor";
    } catch {
      return "Campaign Monitor";
    }
  },
  callbackPath: "/api/campaignmonitor/callback",
};

type CmClient = { ClientID?: string; Name?: string };

// Campaign Monitor nests clients under the account — each is a selectable account.
export async function listCampaignMonitorClients(accessToken: string): Promise<IntegrationAccount[]> {
  const clients = await cmGet<CmClient[]>(accessToken, "/clients.json");
  return (clients ?? [])
    .filter((c) => c.ClientID)
    .map((c) => ({ id: c.ClientID as string, name: c.Name ?? (c.ClientID as string) }));
}

type CmCampaign = { CampaignID?: string; Name?: string; SentDate?: string; TotalRecipients?: number };
type CmSummary = { Recipients?: number; UniqueOpened?: number; Clicks?: number; Unsubscribed?: number };
type CmList = { ListID?: string };
type CmListStats = { TotalActiveSubscribers?: number };

const n = (v: number | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

// SentDate looks like "2024-01-15 09:00:00".
const day = (v: string | undefined) => (v ?? "").slice(0, 10);

type Row = { name: string; date: string; sent: number; opens: number; clicks: number; unsubs: number };

async function summarize(accessToken: string, campaigns: CmCampaign[]): Promise<Row[]> {
  const rows: Row[] = [];
  for (const c of campaigns.slice(0, MAX_CAMPAIGNS)) {
    if (!c.CampaignID) continue;
    const s = await cmGet<CmSummary>(accessToken, `/campaigns/${encodeURIComponent(c.CampaignID)}/summary.json`)
      .catch(() => ({} as CmSummary));
    rows.push({
      name: c.Name ?? c.CampaignID,
      date: day(c.SentDate),
      sent: n(s.Recipients) || n(c.TotalRecipients),
      opens: n(s.UniqueOpened),
      clicks: n(s.Clicks),
      unsubs: n(s.Unsubscribed),
    });
  }
  return rows;
}

function totalsFrom(rows: Row[], subscribers: number): EmailTotals {
  const emailsSent = rows.reduce((s, r) => s + r.sent, 0);
  const opens = rows.reduce((s, r) => s + r.opens, 0);
  const clicks = rows.reduce((s, r) => s + r.clicks, 0);
  return {
    subscribers,
    newSubscribers: 0, // Campaign Monitor exposes no cheap per-period new-subscriber count
    unsubscribes: rows.reduce((s, r) => s + r.unsubs, 0),
    campaigns: rows.length,
    emailsSent,
    opens,
    openRate: ratio(opens, emailsSent),
    clicks,
    clickRate: ratio(clicks, emailsSent),
  };
}

// Active subscribers across the client's lists (bounded fan-out, best effort).
async function subscriberCount(accessToken: string, clientId: string): Promise<number> {
  const lists = await cmGet<CmList[]>(accessToken, `/clients/${encodeURIComponent(clientId)}/lists.json`).catch(() => [] as CmList[]);
  let total = 0;
  for (const l of (lists ?? []).slice(0, MAX_LISTS)) {
    if (!l.ListID) continue;
    const stats = await cmGet<CmListStats>(accessToken, `/lists/${encodeURIComponent(l.ListID)}/stats.json`).catch(() => ({} as CmListStats));
    total += n(stats.TotalActiveSubscribers);
  }
  return total;
}

// Fetches the normalized email report for one Campaign Monitor client and period,
// plus the prior equal-length period. accountId = the Campaign Monitor ClientID.
export async function fetchCampaignMonitorReport(accessToken: string, clientId: string, periodDays: number): Promise<EmailReport> {
  const days = dayRange(periodDays);
  const since = days[0];
  const prevSince = dayRange(periodDays * 2)[0];

  const [sent, subscribers] = await Promise.all([
    cmGet<{ Results?: CmCampaign[] } | CmCampaign[]>(accessToken, `/clients/${encodeURIComponent(clientId)}/campaigns.json`)
      .catch(() => [] as CmCampaign[]),
    subscriberCount(accessToken, clientId).catch(() => 0),
  ]);

  // v3.3 paginates some listings as { Results: [...] }; tolerate both shapes.
  const all: CmCampaign[] = Array.isArray(sent) ? sent : (sent.Results ?? []);
  const inPeriod = all.filter((c) => day(c.SentDate) >= since);
  const inPrev = all.filter((c) => day(c.SentDate) >= prevSince && day(c.SentDate) < since);

  const [rows, prevRows] = await Promise.all([
    summarize(accessToken, inPeriod),
    summarize(accessToken, inPrev).catch(() => [] as Row[]),
  ]);

  // No daily series endpoint — bucket each campaign onto its send date.
  const byDay = new Map<string, EmailDay>();
  for (const d of days) byDay.set(d, { date: d, sent: 0, opens: 0, clicks: 0 });
  for (const r of rows) {
    const d = byDay.get(r.date);
    if (!d) continue;
    d.sent += r.sent;
    d.opens += r.opens;
    d.clicks += r.clicks;
  }

  const topCampaigns: EmailCampaign[] = rows
    .map((r) => ({
      name: r.name,
      sentAt: r.date,
      sent: r.sent,
      openRate: ratio(r.opens, r.sent),
      clickRate: ratio(r.clicks, r.sent),
    }))
    .sort((a, b) => b.sent - a.sent)
    .slice(0, 10);

  return {
    platform: "campaignmonitor",
    totals: totalsFrom(rows, subscribers),
    previousTotals: prevRows.length ? totalsFrom(prevRows, subscribers) : null,
    byDate: Array.from(byDay.values()),
    topCampaigns,
  };
}
