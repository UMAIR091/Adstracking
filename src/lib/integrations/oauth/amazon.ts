// Amazon Ads backend (Amazon Advertising API v3). Auth is Login with Amazon
// (LwA) OAuth 2.0; the API is region-specific (NA/EU/FE) and profile-scoped —
// every call carries the client id + the selected profile as the
// Amazon-Advertising-API-Scope header. Metrics come from the v3 async reporting
// API (create report → poll → download gzipped JSON), normalized into the shared
// AdsReport (AdsAnalytics).
//
// Reporting is asynchronous, so fetchSnapshot creates a Sponsored Products report
// and polls within the serverless budget (~40s). If the report isn't ready in
// time it throws, and the next scheduled sync retries with a fresh report — the
// snapshot converges without an always-on worker. Region defaults to NA; set
// AMAZON_ADS_REGION=EU|FE for accounts in those regions.
import { gunzipSync } from "node:zlib";
import type { IntegrationAccount, OAuthProvider, TokenSet } from "../types";
import { adsTotals, dayRange, isoDay, withRetry, type AdsDay, type AdsReport } from "../metrics";

const REGIONS = {
  NA: { api: "https://advertising-api.amazon.com", authorize: "https://www.amazon.com/ap/oa", token: "https://api.amazon.com/auth/o2/token" },
  EU: { api: "https://advertising-api-eu.amazon.com", authorize: "https://eu.account.amazon.com/ap/oa", token: "https://api.amazon.co.uk/auth/o2/token" },
  FE: { api: "https://advertising-api-fe.amazon.com", authorize: "https://apac.account.amazon.com/ap/oa", token: "https://api.amazon.co.jp/auth/o2/token" },
};
const SCOPE = "advertising::campaign_management";
// Sponsored Products campaign report, daily. cost=spend, purchases30d=conversions,
// sales30d=revenue.
const COLUMNS = ["date", "campaignId", "campaignName", "impressions", "clicks", "cost", "purchases30d", "sales30d"];

function env(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`${key} is not set`);
  return v;
}

export function amazonConfigured(): boolean {
  return Boolean(process.env.AMAZON_ADS_CLIENT_ID && process.env.AMAZON_ADS_CLIENT_SECRET);
}

function region() {
  return REGIONS[(process.env.AMAZON_ADS_REGION as keyof typeof REGIONS) ?? "NA"] ?? REGIONS.NA;
}

function redirectUri(): string {
  return `${env("NEXT_PUBLIC_APP_URL")}/api/amazon/callback`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Ads API request with the required ClientId header and (optionally) the
// profile Scope header.
async function adsFetch<T>(path: string, accessToken: string, profileId?: string, init?: RequestInit): Promise<T> {
  return withRetry(async () => {
    const res = await fetch(`${region().api}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Amazon-Advertising-API-ClientId": env("AMAZON_ADS_CLIENT_ID"),
        ...(profileId ? { "Amazon-Advertising-API-Scope": profileId } : {}),
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
    });
    if (res.status === 429) throw new Error("Amazon Ads rate limit (429)");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = (data as { message?: string; details?: string }).details
        ?? (data as { message?: string }).message ?? res.statusText;
      throw new Error(`Amazon Ads API error: ${detail} (${res.status})`);
    }
    return data as T;
  });
}

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number };

async function tokenRequest(body: Record<string, string>): Promise<TokenSet> {
  const res = await fetch(region().token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: env("AMAZON_ADS_CLIENT_ID"),
      client_secret: env("AMAZON_ADS_CLIENT_SECRET"),
      ...body,
    }).toString(),
  });
  const data = (await res.json().catch(() => ({}))) as TokenResponse & { error_description?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(`Amazon token request failed: ${data.error_description ?? res.statusText} (${res.status})`);
  }
  return { access_token: data.access_token, refresh_token: data.refresh_token, expires_in: data.expires_in ?? 3600 };
}

export const amazonOAuth: OAuthProvider = {
  id: "amazon",
  authUrl(state) {
    const params = new URLSearchParams({
      client_id: env("AMAZON_ADS_CLIENT_ID"),
      scope: SCOPE,
      response_type: "code",
      redirect_uri: redirectUri(),
      state,
    });
    return `${region().authorize}?${params.toString()}`;
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
      const profiles = await listProfiles(accessToken);
      return profiles[0]?.name ?? "Amazon Ads account";
    } catch {
      return "Amazon Ads account";
    }
  },
  callbackPath: "/api/amazon/callback",
};

type Profile = { profileId: number; countryCode?: string; currencyCode?: string; accountInfo?: { name?: string; type?: string } };

async function listProfiles(accessToken: string): Promise<{ id: string; name: string; currency: string }[]> {
  const data = await adsFetch<Profile[]>("/v2/profiles", accessToken);
  return (data ?? []).map((p) => ({
    id: String(p.profileId),
    name: p.accountInfo?.name ? `${p.accountInfo.name}${p.countryCode ? ` (${p.countryCode})` : ""}` : `Profile ${p.profileId}`,
    currency: p.currencyCode ?? "USD",
  }));
}

// Lists the advertising profiles (accounts) the user can access.
export async function listAmazonProfiles(accessToken: string): Promise<IntegrationAccount[]> {
  return (await listProfiles(accessToken)).map((p) => ({ id: p.id, name: p.name }));
}

// ── Async reporting ──────────────────────────────────────────

type ReportRow = { date?: string; campaignId?: number | string; campaignName?: string; impressions?: number; clicks?: number; cost?: number; purchases30d?: number; sales30d?: number };

async function createReport(accessToken: string, profileId: string, startDate: string, endDate: string): Promise<string> {
  const body = {
    name: `reportflow-sp-${startDate}-${endDate}`,
    startDate,
    endDate,
    configuration: {
      adProduct: "SPONSORED_PRODUCTS",
      groupBy: ["campaign"],
      columns: COLUMNS,
      reportTypeId: "spCampaigns",
      timeUnit: "DAILY",
      format: "GZIP_JSON",
    },
  };
  const data = await adsFetch<{ reportId?: string }>("/reporting/reports", accessToken, profileId, {
    method: "POST",
    headers: { "Content-Type": "application/vnd.createasyncreportrequest.v3+json" },
    body: JSON.stringify(body),
  });
  if (!data.reportId) throw new Error("Amazon Ads did not return a reportId");
  return data.reportId;
}

// Polls the report to completion within the serverless budget, then downloads
// and gunzips the JSON rows. Throws if it isn't ready in time (next sync retries).
async function awaitReport(accessToken: string, profileId: string, reportId: string): Promise<ReportRow[]> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const status = await adsFetch<{ status?: string; url?: string }>(`/reporting/reports/${reportId}`, accessToken, profileId);
    if (status.status === "COMPLETED" && status.url) {
      const res = await fetch(status.url); // presigned S3 URL — no auth headers
      const buf = Buffer.from(await res.arrayBuffer());
      const json = JSON.parse(gunzipSync(buf).toString("utf8"));
      return Array.isArray(json) ? (json as ReportRow[]) : [];
    }
    if (status.status === "FAILURE" || status.status === "CANCELLED") {
      throw new Error(`Amazon Ads report ${status.status?.toLowerCase()}`);
    }
    await sleep(5000);
  }
  throw new Error("Amazon Ads report still generating — will retry on the next sync.");
}

const n = (v: number | string | undefined): number => {
  const x = typeof v === "string" ? Number(v) : v;
  return typeof x === "number" && Number.isFinite(x) ? x : 0;
};

// Fetches the normalized ads report for one profile and period. accountId = the
// Amazon advertising profileId. No separate previous-period call — one Amazon
// report is comparatively expensive, so comparison is omitted here.
export async function fetchAmazonAdsReport(
  accessToken: string, profileId: string, periodDays: number
): Promise<AdsReport> {
  const startDate = isoDay(periodDays);
  const endDate = isoDay(1);

  const profiles = await listProfiles(accessToken).catch(() => []);
  const currency = profiles.find((p) => p.id === profileId)?.currency ?? "USD";

  const reportId = await createReport(accessToken, profileId, startDate, endDate);
  const rows = await awaitReport(accessToken, profileId, reportId);

  const byDay = new Map<string, AdsDay>();
  for (const d of dayRange(periodDays)) byDay.set(d, { date: d, spend: 0, impressions: 0, clicks: 0, conversions: 0 });
  const byCampaign = new Map<string, { name: string; spend: number; impressions: number; clicks: number; conversions: number }>();
  let revenue = 0;

  for (const r of rows) {
    const date = (r.date ?? "").slice(0, 10);
    const day = byDay.get(date);
    if (day) {
      day.spend += n(r.cost);
      day.impressions += n(r.impressions);
      day.clicks += n(r.clicks);
      day.conversions += n(r.purchases30d);
    }
    revenue += n(r.sales30d);
    const cid = String(r.campaignId ?? r.campaignName ?? "—");
    const agg = byCampaign.get(cid) ?? { name: r.campaignName ?? cid, spend: 0, impressions: 0, clicks: 0, conversions: 0 };
    agg.spend += n(r.cost);
    agg.impressions += n(r.impressions);
    agg.clicks += n(r.clicks);
    agg.conversions += n(r.purchases30d);
    byCampaign.set(cid, agg);
  }

  const byDate = Array.from(byDay.values());
  const topCampaigns = Array.from(byCampaign.values())
    .map((c) => ({ name: c.name, spend: c.spend, impressions: c.impressions, clicks: c.clicks, ctr: c.impressions > 0 ? c.clicks / c.impressions : 0, conversions: c.conversions }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 10);

  return {
    platform: "amazon_ads",
    currency,
    totals: { ...adsTotals(byDate, revenue) },
    previousTotals: null,
    byDate,
    topCampaigns,
  };
}
