// Google Ads API backend (REST + GAQL). Reuses the shared Google OAuth app —
// only the developer token is Ads-specific. Produces the normalized AdsReport
// so dashboards/reports read identically across ad platforms.
//
// Requires GOOGLE_ADS_DEVELOPER_TOKEN (from a Google Ads Manager account →
// API Center). A token pending approval still works against test accounts.
import type { IntegrationAccount } from "../types";
import { adsTotals, dayRange, isoDay, withRetry, type AdsDay, type AdsReport } from "../metrics";

const API_VERSION = process.env.GOOGLE_ADS_API_VERSION || "v21";
const API = `https://googleads.googleapis.com/${API_VERSION}`;

export function googleAdsConfigured(): boolean {
  return Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN);
}

function headers(accessToken: string): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
    "Content-Type": "application/json",
  };
  // Set when access goes through a manager (MCC) account.
  const login = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
  if (login) h["login-customer-id"] = login.replace(/-/g, "");
  return h;
}

async function adsPost<T>(path: string, accessToken: string, body: unknown): Promise<T> {
  return withRetry(async () => {
    const res = await fetch(`${API}${path}`, { method: "POST", headers: headers(accessToken), body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail =
        (data as { error?: { message?: string } }).error?.message ?? `${res.status} ${res.statusText}`;
      throw new Error(`Google Ads API error: ${detail}`);
    }
    return data as T;
  });
}

type GaqlRow = {
  customer?: { descriptiveName?: string; currencyCode?: string };
  campaign?: { name?: string };
  segments?: { date?: string };
  metrics?: {
    costMicros?: string;
    impressions?: string;
    clicks?: string;
    conversions?: number;
    conversionsValue?: number;
    ctr?: number;
  };
};

async function gaql(accessToken: string, customerId: string, query: string): Promise<GaqlRow[]> {
  const data = await adsPost<{ results?: GaqlRow[] }>(
    `/customers/${customerId.replace(/-/g, "")}/googleAds:search`,
    accessToken,
    { query, pageSize: 10000 }
  );
  return data.results ?? [];
}

const micros = (v: string | undefined) => (v ? Number(v) / 1_000_000 : 0);
const num = (v: string | number | undefined) => (v ? Number(v) : 0);

// Lists the ad accounts (customers) the authenticated user can access, with
// their display names. Name lookups that fail (e.g. manager-only access)
// degrade to the bare id rather than failing the whole list.
export async function listGoogleAdsAccounts(accessToken: string): Promise<IntegrationAccount[]> {
  const res = await withRetry(async () => {
    const r = await fetch(`${API}/customers:listAccessibleCustomers`, { headers: headers(accessToken) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const detail = (data as { error?: { message?: string } }).error?.message ?? `${r.status}`;
      throw new Error(`Google Ads API error: ${detail}`);
    }
    return data as { resourceNames?: string[] };
  });

  const ids = (res.resourceNames ?? []).map((n) => n.replace("customers/", ""));
  const accounts = await Promise.all(
    ids.map(async (id) => {
      try {
        const rows = await gaql(accessToken, id, "SELECT customer.descriptive_name FROM customer LIMIT 1");
        const name = rows[0]?.customer?.descriptiveName;
        return { id, name: name ? `${name} (${id})` : id };
      } catch {
        return { id, name: id };
      }
    })
  );
  return accounts;
}

// Fetches the normalized ads report for one customer and period, plus the
// prior equal-length period for comparison.
export async function fetchGoogleAdsReport(
  accessToken: string,
  customerId: string,
  periodDays: number
): Promise<AdsReport> {
  const since = isoDay(periodDays);
  const until = isoDay(1);
  const prevSince = isoDay(periodDays * 2);
  const prevUntil = isoDay(periodDays + 1);
  const metricsFields = "metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value";

  const [meta, dailyRows, prevRows, campaignRows] = await Promise.all([
    gaql(accessToken, customerId, "SELECT customer.currency_code FROM customer LIMIT 1").catch(() => [] as GaqlRow[]),
    gaql(accessToken, customerId,
      `SELECT segments.date, ${metricsFields} FROM customer WHERE segments.date BETWEEN '${since}' AND '${until}'`),
    gaql(accessToken, customerId,
      `SELECT ${metricsFields} FROM customer WHERE segments.date BETWEEN '${prevSince}' AND '${prevUntil}'`
    ).catch(() => [] as GaqlRow[]),
    gaql(accessToken, customerId,
      `SELECT campaign.name, ${metricsFields}, metrics.ctr FROM campaign WHERE segments.date BETWEEN '${since}' AND '${until}' ORDER BY metrics.cost_micros DESC LIMIT 10`
    ).catch(() => [] as GaqlRow[]),
  ]);

  const byDay = new Map<string, AdsDay>();
  for (const d of dayRange(periodDays)) byDay.set(d, { date: d, spend: 0, impressions: 0, clicks: 0, conversions: 0 });
  let revenue = 0;
  for (const r of dailyRows) {
    const d = r.segments?.date;
    const row = d ? byDay.get(d) : undefined;
    if (!row) continue;
    row.spend += micros(r.metrics?.costMicros);
    row.impressions += num(r.metrics?.impressions);
    row.clicks += num(r.metrics?.clicks);
    row.conversions += num(r.metrics?.conversions);
    revenue += num(r.metrics?.conversionsValue);
  }
  const byDate = Array.from(byDay.values());

  let previousTotals: AdsReport["previousTotals"] = null;
  if (prevRows.length) {
    const prevDay: AdsDay = { date: prevSince, spend: 0, impressions: 0, clicks: 0, conversions: 0 };
    let prevRevenue = 0;
    for (const r of prevRows) {
      prevDay.spend += micros(r.metrics?.costMicros);
      prevDay.impressions += num(r.metrics?.impressions);
      prevDay.clicks += num(r.metrics?.clicks);
      prevDay.conversions += num(r.metrics?.conversions);
      prevRevenue += num(r.metrics?.conversionsValue);
    }
    previousTotals = adsTotals([prevDay], prevRevenue);
  }

  return {
    platform: "google_ads",
    currency: meta[0]?.customer?.currencyCode ?? "USD",
    totals: adsTotals(byDate, revenue),
    previousTotals,
    byDate,
    topCampaigns: campaignRows.map((r) => ({
      name: r.campaign?.name ?? "—",
      spend: micros(r.metrics?.costMicros),
      impressions: num(r.metrics?.impressions),
      clicks: num(r.metrics?.clicks),
      ctr: num(r.metrics?.ctr),
      conversions: num(r.metrics?.conversions),
    })),
  };
}
