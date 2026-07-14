// Meta (Facebook) OAuth backend + Marketing API helpers. Pure HTTP, no DB.
// Meta issues long-lived (~60 day) user tokens and has no refresh token, so we
// "refresh" by re-exchanging the still-valid long-lived token (fb_exchange_token)
// and store the result as both access and refresh token.
import crypto from "node:crypto";
import type { OAuthProvider, TokenSet, IntegrationAccount } from "../types";

const API_VERSION = process.env.META_API_VERSION || "v21.0";
const GRAPH = `https://graph.facebook.com/${API_VERSION}`;
export const META_DIALOG = `https://www.facebook.com/${API_VERSION}/dialog/oauth`;
const SCOPES = ["ads_read", "business_management"];
const SIXTY_DAYS = 60 * 24 * 60 * 60;

// Exported for sibling Meta-platform backends (Instagram, Facebook Pages).
export function metaEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`${key} is not set`);
  return v;
}
const env = metaEnv;

// True only when the Meta app is fully configured. Meta Ads and Instagram share
// this app, so both stay "soon" until every var exists — otherwise the UI would
// offer a Connect whose authUrl() throws on the missing env var (a 500).
export function metaConfigured(): boolean {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET && process.env.META_OAUTH_REDIRECT_URI);
}

// HMAC of the access token with the app secret. Meta requires this on server-side
// Graph calls when "Require App Secret proof" is enabled, and accepts it otherwise.
function appSecretProof(accessToken: string): string {
  return crypto.createHmac("sha256", env("META_APP_SECRET")).update(accessToken).digest("hex");
}

// GET against the Graph API with Meta's error envelope surfaced as a real error.
// Calls that carry a user access token are automatically signed with appsecret_proof.
// Exported so sibling Meta-platform backends (Instagram, Facebook Pages) reuse it.
export async function graphGet<T = Record<string, unknown>>(path: string, params: Record<string, string>): Promise<T> {
  const signed = params.access_token ? { ...params, appsecret_proof: appSecretProof(params.access_token) } : params;
  const res = await fetch(`${GRAPH}${path}?${new URLSearchParams(signed).toString()}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || (data as { error?: { message?: string } }).error) {
    const msg = (data as { error?: { message?: string } }).error?.message ?? res.statusText;
    throw new Error(`Meta API error: ${msg}`);
  }
  return data as T;
}

export const metaOAuth: OAuthProvider = {
  id: "meta",
  authUrl(state) {
    const params = new URLSearchParams({
      client_id: env("META_APP_ID"),
      redirect_uri: env("META_OAUTH_REDIRECT_URI"),
      state,
      scope: SCOPES.join(","),
      response_type: "code",
    });
    return `${META_DIALOG}?${params.toString()}`;
  },

  // Exchange the auth code for a short-lived token, then upgrade it to a
  // long-lived (~60 day) token. Stored as both access + refresh token.
  async exchangeCode(code): Promise<TokenSet> {
    const short = await graphGet<{ access_token: string }>("/oauth/access_token", {
      client_id: env("META_APP_ID"),
      client_secret: env("META_APP_SECRET"),
      redirect_uri: env("META_OAUTH_REDIRECT_URI"),
      code,
    });
    const long = await graphGet<{ access_token: string; expires_in?: number }>("/oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: env("META_APP_ID"),
      client_secret: env("META_APP_SECRET"),
      fb_exchange_token: short.access_token,
    });
    return { access_token: long.access_token, refresh_token: long.access_token, expires_in: long.expires_in || SIXTY_DAYS };
  },

  // Re-exchange a still-valid long-lived token for a fresh 60-day one.
  async refresh(token): Promise<TokenSet> {
    const long = await graphGet<{ access_token: string; expires_in?: number }>("/oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: env("META_APP_ID"),
      client_secret: env("META_APP_SECRET"),
      fb_exchange_token: token,
    });
    return { access_token: long.access_token, refresh_token: long.access_token, expires_in: long.expires_in || SIXTY_DAYS };
  },

  async identity(accessToken): Promise<string> {
    const me = await graphGet<{ name?: string }>("/me", { fields: "name", access_token: accessToken });
    return me.name ?? "Meta account";
  },

  // De-authorizes the app for this user (removes all granted permissions).
  // Best-effort — disconnect proceeds even if this fails.
  async revoke({ accessToken }): Promise<void> {
    if (!accessToken) return;
    const params = new URLSearchParams({ access_token: accessToken, appsecret_proof: appSecretProof(accessToken) });
    const res = await fetch(`${GRAPH}/me/permissions?${params.toString()}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`Meta permission revoke failed: ${await res.text()}`);
  },

  // Registered in the Meta app's Facebook Login settings.
  callbackPath: "/api/meta/callback",
};

// Lists the ad accounts the authenticated user can access (Marketing API).
// Account ids come back as "act_<id>" — the form the insights endpoints expect.
export async function listMetaAdAccounts(accessToken: string): Promise<IntegrationAccount[]> {
  const data = await graphGet<{ data?: { id: string; account_id?: string; name?: string }[] }>("/me/adaccounts", {
    fields: "account_id,name,account_status,currency",
    limit: "200",
    access_token: accessToken,
  });
  return (data.data ?? []).map((a) => ({
    id: a.id, // already "act_<id>"
    name: a.name || a.account_id || a.id,
  }));
}

// ── Marketing API insights (real data cached by the sync job) ────────────────
export type MetaAdsTotals = {
  spend: number; impressions: number; clicks: number; ctr: number; cpc: number;
  reach: number; conversions: number; costPerConversion: number;
};
export type MetaAdsDay = { date: string; spend: number; impressions: number; clicks: number };
export type MetaAdsCampaign = { name: string; spend: number; impressions: number; clicks: number; ctr: number };
export type MetaAdsReport = {
  totals: MetaAdsTotals;
  previousTotals: MetaAdsTotals | null;
  byDate: MetaAdsDay[];
  topCampaigns: MetaAdsCampaign[];
};

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

type InsightRow = {
  date_start?: string;
  spend?: string; impressions?: string; clicks?: string; ctr?: string; cpc?: string; reach?: string;
  campaign_name?: string;
  actions?: { action_type: string; value: string }[];
};

const num = (v: string | undefined) => (v ? Number(v) : 0);

// Sum conversion-like actions (purchases, leads, registrations, custom conversions).
function conversionsFrom(actions?: { action_type: string; value: string }[]): number {
  if (!actions) return 0;
  const wanted = /purchase|lead|complete_registration|offsite_conversion/i;
  return actions.filter((a) => wanted.test(a.action_type)).reduce((s, a) => s + Number(a.value || 0), 0);
}

function totalsFrom(row: InsightRow | undefined): MetaAdsTotals {
  const spend = num(row?.spend);
  const conversions = conversionsFrom(row?.actions);
  return {
    spend,
    impressions: num(row?.impressions),
    clicks: num(row?.clicks),
    ctr: num(row?.ctr) / 100, // Meta returns CTR as a percentage
    cpc: num(row?.cpc),
    reach: num(row?.reach),
    conversions,
    costPerConversion: conversions > 0 ? spend / conversions : 0,
  };
}

async function insights(accessToken: string, accountId: string, params: Record<string, string>): Promise<InsightRow[]> {
  const data = await graphGet<{ data?: InsightRow[] }>(`/${accountId}/insights`, { access_token: accessToken, ...params });
  return data.data ?? [];
}

// Fetches a real insights report for one ad account and period, plus the prior
// equal-length period for comparison. No mock data.
export async function fetchMetaAdsReport(accessToken: string, accountId: string, periodDays: number): Promise<MetaAdsReport> {
  const since = isoDaysAgo(periodDays);
  const until = isoDaysAgo(1);
  const prevSince = isoDaysAgo(periodDays * 2);
  const prevUntil = isoDaysAgo(periodDays + 1);
  const range = (s: string, u: string) => JSON.stringify({ since: s, until: u });
  const totalsFields = "spend,impressions,clicks,ctr,cpc,reach,actions";

  const [totalsRows, prevRows, dailyRows, campaignRows] = await Promise.all([
    insights(accessToken, accountId, { time_range: range(since, until), fields: totalsFields }),
    insights(accessToken, accountId, { time_range: range(prevSince, prevUntil), fields: totalsFields }).catch(() => []),
    insights(accessToken, accountId, { time_range: range(since, until), time_increment: "1", fields: "spend,impressions,clicks" }),
    insights(accessToken, accountId, { time_range: range(since, until), level: "campaign", fields: "campaign_name,spend,impressions,clicks,ctr", limit: "10" }),
  ]);

  return {
    totals: totalsFrom(totalsRows[0]),
    previousTotals: prevRows.length ? totalsFrom(prevRows[0]) : null,
    byDate: dailyRows.map((r) => ({ date: r.date_start ?? "", spend: num(r.spend), impressions: num(r.impressions), clicks: num(r.clicks) })),
    topCampaigns: campaignRows.map((r) => ({ name: r.campaign_name ?? "—", spend: num(r.spend), impressions: num(r.impressions), clicks: num(r.clicks), ctr: num(r.ctr) / 100 })),
  };
}
