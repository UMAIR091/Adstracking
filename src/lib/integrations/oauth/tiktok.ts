// TikTok Ads backend (TikTok for Business API). OAuth issues a long-lived
// token with no refresh flow and no documented expiry — stored with a 1-year
// horizon and re-validated on "refresh" (revocation surfaces as an API error
// → reconnect prompt). TikTok's envelope is HTTP 200 + {code!=0} on errors.
// Fills the normalized AdsReport rendered by the shared AdsAnalytics block.
import type { IntegrationAccount, OAuthProvider, TokenSet } from "../types";
import { adsTotals, dayRange, isoDay, withRetry, type AdsDay, type AdsReport } from "../metrics";

const API = "https://business-api.tiktok.com/open_api/v1.3";
const ONE_YEAR = 365 * 24 * 60 * 60;

function env(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`${key} is not set`);
  return v;
}

export function tiktokConfigured(): boolean {
  return Boolean(process.env.TIKTOK_APP_ID && process.env.TIKTOK_APP_SECRET);
}

type Envelope<T> = { code?: number; message?: string; data?: T };

async function ttRequest<T>(path: string, accessToken: string | null, params?: Record<string, string>): Promise<T> {
  return withRetry(async () => {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : "";
    const res = await fetch(`${API}${path}${qs}`, {
      headers: accessToken ? { "Access-Token": accessToken } : {},
    });
    const body = (await res.json().catch(() => ({}))) as Envelope<T>;
    if (!res.ok || (body.code !== undefined && body.code !== 0)) {
      throw new Error(`TikTok API error: ${body.message ?? res.statusText} (${body.code ?? res.status})`);
    }
    return body.data as T;
  });
}

export const tiktokOAuth: OAuthProvider = {
  id: "tiktok",
  authUrl(state) {
    const params = new URLSearchParams({
      app_id: env("TIKTOK_APP_ID"),
      state,
      redirect_uri: `${env("NEXT_PUBLIC_APP_URL")}/api/tiktok/callback`,
    });
    return `https://business-api.tiktok.com/portal/auth?${params.toString()}`;
  },
  async exchangeCode(code): Promise<TokenSet> {
    const res = await fetch(`${API}/oauth2/access_token/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: env("TIKTOK_APP_ID"), secret: env("TIKTOK_APP_SECRET"), auth_code: code }),
    });
    const body = (await res.json().catch(() => ({}))) as Envelope<{ access_token?: string }>;
    if (!res.ok || body.code !== 0 || !body.data?.access_token) {
      throw new Error(`TikTok token exchange failed: ${body.message ?? res.status}`);
    }
    // Long-lived token; stored as both access + refresh (like Meta).
    return { access_token: body.data.access_token, refresh_token: body.data.access_token, expires_in: ONE_YEAR };
  },
  // No refresh endpoint — re-validate the stored token and extend the horizon.
  async refresh(token): Promise<TokenSet> {
    await ttRequest<{ list?: unknown[] }>("/oauth2/advertiser/get/", token, {
      app_id: env("TIKTOK_APP_ID"),
      secret: env("TIKTOK_APP_SECRET"),
    });
    return { access_token: token, refresh_token: token, expires_in: ONE_YEAR };
  },
  async identity(accessToken) {
    try {
      const data = await ttRequest<{ display_name?: string; email?: string }>("/user/info/", accessToken);
      return data.email ?? data.display_name ?? "TikTok account";
    } catch {
      return "TikTok account";
    }
  },
  callbackPath: "/api/tiktok/callback",
};

export async function listTiktokAdvertisers(accessToken: string): Promise<IntegrationAccount[]> {
  const data = await ttRequest<{ list?: { advertiser_id: string; advertiser_name?: string }[] }>(
    "/oauth2/advertiser/get/", accessToken,
    { app_id: env("TIKTOK_APP_ID"), secret: env("TIKTOK_APP_SECRET") }
  );
  return (data.list ?? []).map((a) => ({ id: a.advertiser_id, name: a.advertiser_name ?? a.advertiser_id }));
}

type ReportRow = {
  dimensions?: { stat_time_day?: string; campaign_id?: string };
  metrics?: Record<string, string | number | undefined>;
};

async function report(
  accessToken: string, advertiserId: string, sinceIso: string, untilIso: string,
  dataLevel: "AUCTION_ADVERTISER" | "AUCTION_CAMPAIGN", dimensions: string[], metrics: string[]
): Promise<ReportRow[]> {
  const data = await ttRequest<{ list?: ReportRow[] }>("/report/integrated/get/", accessToken, {
    advertiser_id: advertiserId,
    report_type: "BASIC",
    data_level: dataLevel,
    dimensions: JSON.stringify(dimensions),
    metrics: JSON.stringify(metrics),
    start_date: sinceIso,
    end_date: untilIso,
    page_size: "200",
  });
  return data.list ?? [];
}

const num = (v: string | number | undefined) => (v !== undefined && v !== null && v !== "-" ? Number(v) : 0);
const BASE_METRICS = ["spend", "impressions", "clicks", "conversion", "total_complete_payment_rate"];

// Fetches the normalized ads report for one advertiser and period, plus the
// prior equal-length period for comparison.
export async function fetchTiktokAdsReport(
  accessToken: string, advertiserId: string, periodDays: number
): Promise<AdsReport> {
  const since = isoDay(periodDays);
  const until = isoDay(1);

  const [dailyRows, prevRows, campaignRows] = await Promise.all([
    report(accessToken, advertiserId, since, until, "AUCTION_ADVERTISER", ["stat_time_day"], BASE_METRICS.slice(0, 4)),
    report(accessToken, advertiserId, isoDay(periodDays * 2), isoDay(periodDays + 1), "AUCTION_ADVERTISER", ["stat_time_day"], BASE_METRICS.slice(0, 4))
      .catch(() => [] as ReportRow[]),
    report(accessToken, advertiserId, since, until, "AUCTION_CAMPAIGN", ["campaign_id"], [...BASE_METRICS.slice(0, 4), "campaign_name"])
      .catch(() => [] as ReportRow[]),
  ]);

  const byDay = new Map<string, AdsDay>();
  for (const d of dayRange(periodDays)) byDay.set(d, { date: d, spend: 0, impressions: 0, clicks: 0, conversions: 0 });
  for (const r of dailyRows) {
    const row = byDay.get((r.dimensions?.stat_time_day ?? "").slice(0, 10));
    if (!row) continue;
    row.spend += num(r.metrics?.spend);
    row.impressions += num(r.metrics?.impressions);
    row.clicks += num(r.metrics?.clicks);
    row.conversions += num(r.metrics?.conversion);
  }
  const byDate = Array.from(byDay.values());

  let previousTotals: AdsReport["previousTotals"] = null;
  if (prevRows.length) {
    const prev: AdsDay[] = prevRows.map((r) => ({
      date: since,
      spend: num(r.metrics?.spend),
      impressions: num(r.metrics?.impressions),
      clicks: num(r.metrics?.clicks),
      conversions: num(r.metrics?.conversion),
    }));
    previousTotals = adsTotals(prev);
  }

  return {
    // Advertiser currency isn't in the report payload; spend is reported in
    // the advertiser's currency — default display to USD formatting.
    platform: "tiktok_ads",
    currency: "USD",
    totals: adsTotals(byDate),
    previousTotals,
    byDate,
    topCampaigns: campaignRows
      .map((r) => {
        const impressions = num(r.metrics?.impressions);
        const clicks = num(r.metrics?.clicks);
        return {
          name: String(r.metrics?.campaign_name ?? r.dimensions?.campaign_id ?? "—"),
          spend: num(r.metrics?.spend),
          impressions,
          clicks,
          ctr: impressions > 0 ? clicks / impressions : 0,
          conversions: num(r.metrics?.conversion),
        };
      })
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 10),
  };
}
