// Reddit Ads backend (Reddit Ads API v3). Auth is Reddit's standard OAuth 2.0
// (authorize/token on reddit.com, Basic-authed token endpoint, duration=permanent
// to receive a refresh token) with a mandatory descriptive User-Agent on every
// request. Ad performance normalizes into the shared AdsReport (AdsAnalytics).
//
// NOTE ON VERIFICATION: Reddit's Ads API reference is behind an auth wall and
// access is allow-list gated, so two things below are implemented to the
// best-documented v3 shape and are marked to confirm against a live account:
//   (1) ad-account discovery response shape, and
//   (2) the reports response envelope + whether spend is micro-currency.
// Both are parsed defensively so an unexpected shape fails cleanly (empty/zero)
// rather than corrupting a snapshot.
import type { IntegrationAccount, OAuthProvider, TokenSet } from "../types";
import { adsTotals, dayRange, withRetry, type AdsDay, type AdsReport } from "../metrics";

const ADS_API = "https://ads-api.reddit.com/api/v3";
const OAUTH = "https://www.reddit.com/api/v1";
const IDENTITY_API = "https://oauth.reddit.com/api/v1";
// Reddit rejects requests without a descriptive User-Agent.
const USER_AGENT = "web:reportflow:v1.0 (ReportFlow analytics)";
const SCOPE = "adsread identity";
const MICRO = 1_000_000; // Reddit reports spend in micro-currency (verify on live data).
const FIELDS = ["spend", "impressions", "clicks", "conversions"];

function env(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`${key} is not set`);
  return v;
}

export function redditConfigured(): boolean {
  return Boolean(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET);
}

function redirectUri(): string {
  return `${env("NEXT_PUBLIC_APP_URL")}/api/reddit/callback`;
}

function basicAuth(): string {
  return Buffer.from(`${env("REDDIT_CLIENT_ID")}:${env("REDDIT_CLIENT_SECRET")}`).toString("base64");
}

async function redditFetch<T>(url: string, accessToken: string, init?: RequestInit): Promise<T> {
  return withRetry(async () => {
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });
    if (res.status === 429) throw new Error("Reddit rate limit (429)");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = (data as { error?: string; message?: string }).message
        ?? (data as { error?: string }).error ?? res.statusText;
      throw new Error(`Reddit API error: ${detail} (${res.status})`);
    }
    return data as T;
  });
}

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number };

async function tokenRequest(body: Record<string, string>): Promise<TokenSet> {
  const res = await fetch(`${OAUTH}/access_token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
    body: new URLSearchParams(body).toString(),
  });
  const data = (await res.json().catch(() => ({}))) as TokenResponse & { error?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(`Reddit token request failed: ${data.error ?? res.statusText} (${res.status})`);
  }
  return { access_token: data.access_token, refresh_token: data.refresh_token, expires_in: data.expires_in ?? 3600 };
}

export const redditOAuth: OAuthProvider = {
  id: "reddit",
  authUrl(state) {
    const params = new URLSearchParams({
      client_id: env("REDDIT_CLIENT_ID"),
      response_type: "code",
      state,
      redirect_uri: redirectUri(),
      duration: "permanent", // required to receive a refresh token
      scope: SCOPE,
    });
    return `${OAUTH}/authorize?${params.toString()}`;
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
      const data = await redditFetch<{ name?: string }>(`${IDENTITY_API}/me`, accessToken);
      return data.name ? `u/${data.name}` : "Reddit account";
    } catch {
      return "Reddit account";
    }
  },
  callbackPath: "/api/reddit/callback",
};

// Reddit wraps list payloads as { data: [...] } and single objects as { data: {...} }.
type Wrapped<T> = { data?: T };
type AdAccountItem = { id: string; name?: string; legacy_id?: string };

// Lists the ad accounts the authenticated user can access. Tries the documented
// ad_accounts listing; parses defensively (see file header).
type AdAccountsResponse = Wrapped<AdAccountItem[]> & { ad_accounts?: AdAccountItem[] };

export async function listRedditAdAccounts(accessToken: string): Promise<IntegrationAccount[]> {
  const data = await redditFetch<AdAccountsResponse>(`${ADS_API}/me/ad_accounts`, accessToken)
    .catch(() => ({}) as AdAccountsResponse);
  const items: AdAccountItem[] = (Array.isArray(data.data) ? data.data : data.ad_accounts) ?? [];
  return items.filter((a) => a.id).map((a) => ({ id: a.id, name: a.name ?? a.id }));
}

type ReportRow = Record<string, string | number | undefined> & { date?: string; campaign_id?: string; campaign_name?: string };

const n = (v: string | number | undefined): number => {
  const x = typeof v === "string" ? Number(v) : v;
  return typeof x === "number" && Number.isFinite(x) ? x : 0;
};

// Reddit report timestamps must be hour-aligned (…THH:00:00Z).
function hourAligned(daysAgo: number): string {
  const d = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return `${d.toISOString().slice(0, 13)}:00:00Z`;
}

async function runReport(
  accessToken: string, adAccountId: string, startsAt: string, endsAt: string, breakdowns: string[]
): Promise<ReportRow[]> {
  const data = await redditFetch<Wrapped<{ metrics?: ReportRow[] } | ReportRow[]>>(
    `${ADS_API}/ad_accounts/${encodeURIComponent(adAccountId)}/reports`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({ data: { breakdowns, fields: FIELDS, starts_at: startsAt, ends_at: endsAt, time_zone_id: "GMT" } }),
    }
  );
  const payload = data.data;
  if (Array.isArray(payload)) return payload;
  return payload?.metrics ?? [];
}

function toDay(r: ReportRow): AdsDay {
  return {
    date: (r.date ?? "").slice(0, 10),
    spend: n(r.spend) / MICRO,
    impressions: n(r.impressions),
    clicks: n(r.clicks),
    conversions: n(r.conversions),
  };
}

// Fetches the normalized ads report for one ad account and period, plus the
// prior equal-length period. accountId = the Reddit ad account id.
export async function fetchRedditAdsReport(
  accessToken: string, adAccountId: string, periodDays: number
): Promise<AdsReport> {
  const [dailyRows, prevRows, campaignRows] = await Promise.all([
    runReport(accessToken, adAccountId, hourAligned(periodDays), hourAligned(0), ["DATE"]),
    runReport(accessToken, adAccountId, hourAligned(periodDays * 2), hourAligned(periodDays), ["DATE"]).catch(() => [] as ReportRow[]),
    runReport(accessToken, adAccountId, hourAligned(periodDays), hourAligned(0), ["CAMPAIGN_ID"]).catch(() => [] as ReportRow[]),
  ]);

  const byDay = new Map<string, AdsDay>();
  for (const d of dayRange(periodDays)) byDay.set(d, { date: d, spend: 0, impressions: 0, clicks: 0, conversions: 0 });
  for (const r of dailyRows) {
    const day = byDay.get((r.date ?? "").slice(0, 10));
    if (!day) continue;
    day.spend += n(r.spend) / MICRO;
    day.impressions += n(r.impressions);
    day.clicks += n(r.clicks);
    day.conversions += n(r.conversions);
  }
  const byDate = Array.from(byDay.values());

  const topCampaigns = campaignRows
    .map((r) => {
      const impressions = n(r.impressions);
      const clicks = n(r.clicks);
      return {
        name: String(r.campaign_name ?? r.campaign_id ?? "—"),
        spend: n(r.spend) / MICRO,
        impressions,
        clicks,
        ctr: impressions > 0 ? clicks / impressions : 0,
        conversions: n(r.conversions),
      };
    })
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 10);

  return {
    platform: "reddit_ads",
    currency: "USD",
    totals: adsTotals(byDate),
    previousTotals: prevRows.length ? adsTotals(prevRows.map(toDay)) : null,
    byDate,
    topCampaigns,
  };
}
