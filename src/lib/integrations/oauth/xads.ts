// X (Twitter) Ads backend (X Ads API v12).
//
// AUTH IS OAUTH 1.0a, not OAuth 2.0 — X's Ads API has never moved to OAuth 2.
// That doesn't fit the shared OAuthProvider contract (which assumes a sync
// authUrl(state) + code exchange + refresh), so X uses its own connect/callback
// routes (/api/x/*) that run the 1.0a dance, while reusing everything else:
// encrypted storage, the data_sources row shape, sync, dashboard and disconnect.
//
// 1.0a yields a permanent access token AND an access token secret, both needed to
// sign every request. They're stored together as "<token>:<secret>" in the
// encrypted access_token column (the same two-secrets-in-one pattern Moz uses),
// with a far-future expiry since 1.0a tokens don't expire or refresh.
import crypto from "node:crypto";
import type { IntegrationAccount } from "../types";
import { adsTotals, dayRange, isoDay, withRetry, type AdsDay, type AdsReport } from "../metrics";

const ADS_API = "https://ads-api.twitter.com/12";
const OAUTH_BASE = "https://api.twitter.com/oauth";
const MICRO = 1_000_000;

// httpOnly cookie carrying the in-flight 1.0a request token + target client
// between /api/x/connect and /api/x/callback. Lives here rather than in a
// route file — Next.js only allows handler/config exports from route.ts.
export const X_OAUTH_COOKIE = "x_oauth1";

function env(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`${key} is not set`);
  return v;
}

export function xAdsConfigured(): boolean {
  return Boolean(process.env.X_ADS_CONSUMER_KEY && process.env.X_ADS_CONSUMER_SECRET);
}

export function xRedirectUri(): string {
  return `${env("NEXT_PUBLIC_APP_URL")}/api/x/callback`;
}

// ── OAuth 1.0a signing (RFC 5849) ────────────────────────────

// RFC 3986 percent-encoding — encodeURIComponent leaves !*'() unescaped.
function pct(v: string): string {
  return encodeURIComponent(v).replace(/[!*'()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

// Builds the Authorization header for a signed 1.0a request. `extraOAuth` carries
// flow-specific params (oauth_callback / oauth_verifier); `query` must include any
// URL query params, which participate in the signature base string.
function authHeader(
  method: "GET" | "POST",
  url: string,
  query: Record<string, string>,
  token?: { key: string; secret: string },
  extraOAuth: Record<string, string> = {}
): string {
  const oauth: Record<string, string> = {
    oauth_consumer_key: env("X_ADS_CONSUMER_KEY"),
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_version: "1.0",
    ...(token ? { oauth_token: token.key } : {}),
    ...extraOAuth,
  };

  // Signature base string: METHOD & url & sorted(oauth + query) params.
  const all: Record<string, string> = { ...oauth, ...query };
  const paramString = Object.keys(all)
    .sort()
    .map((k) => `${pct(k)}=${pct(all[k])}`)
    .join("&");
  const base = `${method}&${pct(url)}&${pct(paramString)}`;
  const signingKey = `${pct(env("X_ADS_CONSUMER_SECRET"))}&${pct(token?.secret ?? "")}`;
  const signature = crypto.createHmac("sha1", signingKey).update(base).digest("base64");

  const header: Record<string, string> = { ...oauth, oauth_signature: signature };
  return `OAuth ${Object.keys(header).sort().map((k) => `${pct(k)}="${pct(header[k])}"`).join(", ")}`;
}

function parseForm(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  new URLSearchParams(text).forEach((v, k) => { out[k] = v; });
  return out;
}

// Step 1: get a request token; returns the token + secret and the authorize URL.
export async function xRequestToken(): Promise<{ token: string; secret: string; authorizeUrl: string }> {
  const url = `${OAUTH_BASE}/request_token`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: authHeader("POST", url, {}, undefined, { oauth_callback: xRedirectUri() }) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`X request_token failed: ${text.slice(0, 200)} (${res.status})`);
  const data = parseForm(text);
  if (!data.oauth_token || !data.oauth_token_secret) throw new Error("X request_token returned no token");
  return {
    token: data.oauth_token,
    secret: data.oauth_token_secret,
    authorizeUrl: `${OAUTH_BASE}/authorize?oauth_token=${encodeURIComponent(data.oauth_token)}`,
  };
}

// Step 3: exchange the verifier for a permanent access token + secret.
export async function xAccessToken(requestToken: string, requestSecret: string, verifier: string): Promise<{ token: string; secret: string }> {
  const url = `${OAUTH_BASE}/access_token`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader("POST", url, {}, { key: requestToken, secret: requestSecret }, { oauth_verifier: verifier }),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`X access_token failed: ${text.slice(0, 200)} (${res.status})`);
  const data = parseForm(text);
  if (!data.oauth_token || !data.oauth_token_secret) throw new Error("X access_token returned no token");
  return { token: data.oauth_token, secret: data.oauth_token_secret };
}

// The stored credential is "<token>:<secret>" — X tokens/secrets are base64-ish
// and never contain ":", so a first-colon split is unambiguous.
export function packXToken(token: string, secret: string): string {
  return `${token}:${secret}`;
}
function unpack(stored: string): { key: string; secret: string } {
  const i = stored.indexOf(":");
  if (i < 0) throw new Error("Malformed X credential — please reconnect.");
  return { key: stored.slice(0, i), secret: stored.slice(i + 1) };
}

// ── Ads API ──────────────────────────────────────────────────

async function xGet<T>(stored: string, path: string, query: Record<string, string> = {}): Promise<T> {
  const token = unpack(stored);
  const url = `${ADS_API}${path}`;
  return withRetry(async () => {
    const qs = Object.keys(query).length ? `?${new URLSearchParams(query).toString()}` : "";
    const res = await fetch(`${url}${qs}`, {
      headers: { Authorization: authHeader("GET", url, query, token), Accept: "application/json" },
    });
    if (res.status === 429) throw new Error("X Ads rate limit (429)");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = (data as { errors?: { message?: string }[] }).errors?.[0]?.message ?? res.statusText;
      throw new Error(`X Ads API error: ${detail} (${res.status})`);
    }
    return data as T;
  });
}

type Listing<T> = { data?: T[] };

// Lists the ad accounts the authenticated user can access.
export async function listXAdsAccounts(stored: string): Promise<IntegrationAccount[]> {
  const data = await xGet<Listing<{ id: string; name?: string }>>(stored, "/accounts");
  return (data.data ?? []).map((a) => ({ id: a.id, name: a.name ?? a.id }));
}

export async function xIdentity(stored: string): Promise<string> {
  try {
    const accounts = await listXAdsAccounts(stored);
    return accounts[0]?.name ?? "X Ads account";
  } catch {
    return "X Ads account";
  }
}

// X returns metrics as arrays aligned to the day buckets of the requested window.
type MetricArrays = Record<string, (number | null)[] | null | undefined>;
type StatsEntity = { id?: string; id_data?: { metrics?: MetricArrays }[] };

const at = (arr: (number | null)[] | null | undefined, i: number): number => {
  const v = arr?.[i];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
};

// Stats accept at most 20 entity ids per call.
async function campaignStats(stored: string, accountId: string, ids: string[], start: string, end: string): Promise<StatsEntity[]> {
  const out: StatsEntity[] = [];
  for (let i = 0; i < ids.length; i += 20) {
    const chunk = ids.slice(i, i + 20);
    const data = await xGet<Listing<StatsEntity>>(stored, `/stats/accounts/${encodeURIComponent(accountId)}`, {
      entity: "CAMPAIGN",
      entity_ids: chunk.join(","),
      start_time: start,
      end_time: end,
      granularity: "DAY",
      metric_groups: "BILLING,ENGAGEMENT",
      placement: "ALL_ON_TWITTER",
    });
    out.push(...(data.data ?? []));
  }
  return out;
}

// Fetches the normalized ads report for one account and period. accountId = the
// X ad account id; `stored` is the packed "<token>:<secret>" credential.
export async function fetchXAdsReport(stored: string, accountId: string, periodDays: number): Promise<AdsReport> {
  // X requires day-aligned UTC boundaries for DAY granularity.
  const start = `${isoDay(periodDays)}T00:00:00Z`;
  const end = `${isoDay(0)}T00:00:00Z`;

  const campaigns = await xGet<Listing<{ id: string; name?: string }>>(stored, `/accounts/${encodeURIComponent(accountId)}/campaigns`, { count: "200" })
    .catch(() => ({ data: [] as { id: string; name?: string }[] }));
  const items = campaigns.data ?? [];
  const names = new Map(items.map((c) => [c.id, c.name ?? c.id]));

  const days = dayRange(periodDays);
  const byDay = new Map<string, AdsDay>();
  for (const d of days) byDay.set(d, { date: d, spend: 0, impressions: 0, clicks: 0, conversions: 0 });

  const topCampaigns: AdsReport["topCampaigns"] = [];
  if (items.length) {
    const stats = await campaignStats(stored, accountId, items.map((c) => c.id), start, end).catch(() => [] as StatsEntity[]);
    for (const entity of stats) {
      const m = entity.id_data?.[0]?.metrics;
      let spend = 0, impressions = 0, clicks = 0;
      days.forEach((d, i) => {
        const dayRow = byDay.get(d);
        const s = at(m?.billed_charge_local_micro, i) / MICRO;
        const imp = at(m?.impressions, i);
        const clk = at(m?.clicks, i);
        spend += s; impressions += imp; clicks += clk;
        if (dayRow) { dayRow.spend += s; dayRow.impressions += imp; dayRow.clicks += clk; }
      });
      topCampaigns.push({
        name: names.get(entity.id ?? "") ?? entity.id ?? "—",
        spend, impressions, clicks,
        ctr: impressions > 0 ? clicks / impressions : 0,
        conversions: 0, // conversions require a separate metric group / attribution setup
      });
    }
  }

  const byDate = Array.from(byDay.values());
  return {
    platform: "x_ads",
    currency: "USD", // billed_charge_local_micro is in the account's local currency
    totals: adsTotals(byDate),
    previousTotals: null,
    byDate,
    topCampaigns: topCampaigns.sort((a, b) => b.spend - a.spend).slice(0, 10),
  };
}
