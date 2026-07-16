// Pinterest Ads backend (Pinterest REST API v5). Standard OAuth 2.0: the token
// endpoint uses HTTP Basic auth (app id:secret) and issues a short-lived access
// token plus a refresh token, so this plugs into the shared refresh flow. Ad
// performance is normalized into the shared AdsReport rendered by AdsAnalytics.
import type { IntegrationAccount, OAuthProvider, TokenSet } from "../types";
import { adsTotals, dayRange, isoDay, withRetry, type AdsDay, type AdsReport } from "../metrics";

const API = "https://api.pinterest.com/v5";
// Read-only scopes: ad metrics + the account identity used to label the connection.
const SCOPES = ["ads:read", "user_accounts:read"];
// SPEND_IN_DOLLAR is reported in USD; _1 columns are first-order ad events
// (CLICKTHROUGH_1 = ad Pin clicks). All read-only reporting columns.
const COLUMNS = ["SPEND_IN_DOLLAR", "IMPRESSION_1", "CLICKTHROUGH_1", "TOTAL_CONVERSIONS"];

function env(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`${key} is not set`);
  return v;
}

export function pinterestConfigured(): boolean {
  return Boolean(process.env.PINTEREST_APP_ID && process.env.PINTEREST_APP_SECRET);
}

function redirectUri(): string {
  return `${env("NEXT_PUBLIC_APP_URL")}/api/pinterest/callback`;
}

function basicAuth(): string {
  return Buffer.from(`${env("PINTEREST_APP_ID")}:${env("PINTEREST_APP_SECRET")}`).toString("base64");
}

// GET against the v5 API. Query arrays (columns) are comma-joined as Pinterest
// expects. 429 is marked retryable for withRetry's backoff.
async function pinGet<T>(path: string, accessToken: string, params?: Record<string, string>): Promise<T> {
  return withRetry(async () => {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : "";
    const res = await fetch(`${API}${path}${qs}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    if (res.status === 429) throw new Error("Pinterest rate limit (429)");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = (data as { message?: string; code?: number }).message ?? res.statusText;
      throw new Error(`Pinterest API error: ${detail} (${res.status})`);
    }
    return data as T;
  });
}

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number };

// POST /oauth/token — Basic-authed, form-encoded. Used for both the initial
// code exchange and refresh.
async function tokenRequest(body: Record<string, string>): Promise<TokenSet> {
  const res = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(body).toString(),
  });
  const data = (await res.json().catch(() => ({}))) as TokenResponse & { message?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(`Pinterest token request failed: ${data.message ?? res.statusText} (${res.status})`);
  }
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in ?? 30 * 24 * 60 * 60,
  };
}

export const pinterestOAuth: OAuthProvider = {
  id: "pinterest",
  authUrl(state) {
    const params = new URLSearchParams({
      client_id: env("PINTEREST_APP_ID"),
      redirect_uri: redirectUri(),
      response_type: "code",
      scope: SCOPES.join(" "),
      state,
    });
    return `https://www.pinterest.com/oauth/?${params.toString()}`;
  },
  exchangeCode(code) {
    return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri() });
  },
  async refresh(refreshToken) {
    const tokens = await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
    // Pinterest often omits a fresh refresh_token on refresh — keep the existing
    // one so the connection stays refreshable.
    return { ...tokens, refresh_token: tokens.refresh_token ?? refreshToken };
  },
  async identity(accessToken) {
    try {
      const data = await pinGet<{ username?: string }>("/user_account", accessToken);
      return data.username ? `@${data.username}` : "Pinterest account";
    } catch {
      return "Pinterest account";
    }
  },
  callbackPath: "/api/pinterest/callback",
};

type Paginated<T> = { items?: T[]; bookmark?: string };

// Lists the ad accounts the authenticated user can access.
export async function listPinterestAdAccounts(accessToken: string): Promise<IntegrationAccount[]> {
  const data = await pinGet<Paginated<{ id: string; name?: string }>>("/ad_accounts", accessToken, { page_size: "100" });
  return (data.items ?? []).map((a) => ({ id: a.id, name: a.name ?? a.id }));
}

// One analytics row is keyed by column name plus a DATE (for DAY granularity).
type AnalyticsRow = Record<string, string | number | undefined> & { DATE?: string; CAMPAIGN_ID?: string };

const num = (v: string | number | undefined): number => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
};

// Pinterest analytics endpoints return a JSON array of rows; tolerate an object
// wrapper defensively so a minor response-shape change can't crash the sync.
function asRows(data: unknown): AnalyticsRow[] {
  if (Array.isArray(data)) return data as AnalyticsRow[];
  const wrapped = (data as { data?: unknown; rows?: unknown })?.data ?? (data as { rows?: unknown })?.rows;
  return Array.isArray(wrapped) ? (wrapped as AnalyticsRow[]) : [];
}

async function accountAnalytics(accessToken: string, adAccountId: string, start: string, end: string): Promise<AnalyticsRow[]> {
  const data = await pinGet<unknown>(`/ad_accounts/${encodeURIComponent(adAccountId)}/analytics`, accessToken, {
    start_date: start,
    end_date: end,
    granularity: "DAY",
    columns: COLUMNS.join(","),
  });
  return asRows(data);
}

function toDay(r: AnalyticsRow): AdsDay {
  return {
    date: (r.DATE ?? "").slice(0, 10),
    spend: num(r.SPEND_IN_DOLLAR),
    impressions: num(r.IMPRESSION_1),
    clicks: num(r.CLICKTHROUGH_1),
    conversions: num(r.TOTAL_CONVERSIONS),
  };
}

// Best-effort top campaigns: list campaigns, then pull their aggregated metrics.
async function topCampaigns(accessToken: string, adAccountId: string, start: string, end: string): Promise<AdsReport["topCampaigns"]> {
  const campaigns = await pinGet<Paginated<{ id: string; name?: string }>>(
    `/ad_accounts/${encodeURIComponent(adAccountId)}/campaigns`, accessToken, { page_size: "100" }
  );
  const items = campaigns.items ?? [];
  if (!items.length) return [];
  const names = new Map(items.map((c) => [c.id, c.name ?? c.id]));

  const data = await pinGet<unknown>(`/ad_accounts/${encodeURIComponent(adAccountId)}/campaigns/analytics`, accessToken, {
    start_date: start,
    end_date: end,
    granularity: "TOTAL",
    columns: COLUMNS.join(","),
    campaign_ids: items.slice(0, 100).map((c) => c.id).join(","),
  });

  return asRows(data)
    .map((r) => {
      const impressions = num(r.IMPRESSION_1);
      const clicks = num(r.CLICKTHROUGH_1);
      return {
        name: names.get(String(r.CAMPAIGN_ID)) ?? String(r.CAMPAIGN_ID ?? "—"),
        spend: num(r.SPEND_IN_DOLLAR),
        impressions,
        clicks,
        ctr: impressions > 0 ? clicks / impressions : 0,
        conversions: num(r.TOTAL_CONVERSIONS),
      };
    })
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 10);
}

// Fetches the normalized ads report for one ad account and period, plus the
// prior equal-length period for comparison. accountId = the Pinterest ad account id.
export async function fetchPinterestAdsReport(
  accessToken: string, adAccountId: string, periodDays: number
): Promise<AdsReport> {
  const since = isoDay(periodDays);
  const until = isoDay(1);

  const [dailyRows, prevRows, campaigns] = await Promise.all([
    accountAnalytics(accessToken, adAccountId, since, until),
    accountAnalytics(accessToken, adAccountId, isoDay(periodDays * 2), isoDay(periodDays + 1)).catch(() => [] as AnalyticsRow[]),
    topCampaigns(accessToken, adAccountId, since, until).catch(() => [] as AdsReport["topCampaigns"]),
  ]);

  const byDay = new Map<string, AdsDay>();
  for (const d of dayRange(periodDays)) byDay.set(d, { date: d, spend: 0, impressions: 0, clicks: 0, conversions: 0 });
  for (const r of dailyRows) {
    const day = byDay.get((r.DATE ?? "").slice(0, 10));
    if (!day) continue;
    day.spend += num(r.SPEND_IN_DOLLAR);
    day.impressions += num(r.IMPRESSION_1);
    day.clicks += num(r.CLICKTHROUGH_1);
    day.conversions += num(r.TOTAL_CONVERSIONS);
  }
  const byDate = Array.from(byDay.values());
  const previousTotals = prevRows.length ? adsTotals(prevRows.map(toDay)) : null;

  return {
    platform: "pinterest_ads",
    currency: "USD", // SPEND_IN_DOLLAR is reported in USD.
    totals: adsTotals(byDate),
    previousTotals,
    byDate,
    topCampaigns: campaigns,
  };
}
