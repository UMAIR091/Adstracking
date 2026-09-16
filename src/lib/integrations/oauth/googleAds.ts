// Google Ads API backend (REST + GAQL). Reuses the shared Google OAuth app and
// produces the normalized AdsReport so dashboards/reports read identically
// across ad platforms.
//
// Access belongs to the Google Cloud project behind the OAuth client: Google
// sunset developer tokens on 2026-09-09 and now grants each project an access
// level (Test, Explorer, Basic, Standard). GOOGLE_ADS_DEVELOPER_TOKEN is still
// sent when set, but the API ignores it.
import type { IntegrationAccount } from "../types";
import { adsTotals, dayRange, isoDay, withRetry, type AdsDay, type AdsReport } from "../metrics";

// Google retires each version about a year after release, and a retired
// version answers every call with a 404 (v21 already does). Keep this on a
// supported version: https://developers.google.com/google-ads/api/docs/sunset-dates
const API_VERSION = process.env.GOOGLE_ADS_API_VERSION || "v25";
const API = `https://googleads.googleapis.com/${API_VERSION}`;

// Agencies usually reach a client's ad account through their manager (MCC)
// account, and every call to such an account must name that manager in the
// login-customer-id header. So the manager travels with the account id as
// "<customerId>@<managerId>"; a bare id is an account the user opens directly.
export function parseGoogleAdsAccountId(accountId: string): { customerId: string; loginCustomerId: string } {
  const [customer, manager] = accountId.split("@");
  const customerId = customer.replace(/-/g, "");
  return { customerId, loginCustomerId: manager ? manager.replace(/-/g, "") : customerId };
}

const formatCustomerId = (id: string) => id.replace(/^(\d{3})(\d{3})(\d{4})$/, "$1-$2-$3");

function headers(accessToken: string, loginCustomerId?: string): Record<string, string> {
  const h: Record<string, string> = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
  if (process.env.GOOGLE_ADS_DEVELOPER_TOKEN) h["developer-token"] = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (loginCustomerId) h["login-customer-id"] = loginCustomerId;
  return h;
}

type AdsErrorBody = {
  error?: {
    message?: string;
    details?: { errors?: { errorCode?: Record<string, string>; message?: string }[] }[];
  };
};

// The top-level message is generic ("The caller does not have permission");
// the actionable part, e.g. USER_PERMISSION_DENIED and what to do about it,
// sits in the GoogleAdsFailure details. The HTTP status stays in the message so
// withRetry can tell a transient 5xx/429 from a permanent refusal.
async function adsError(res: Response): Promise<Error> {
  const body = (await res.json().catch(() => ({}))) as AdsErrorBody;
  const first = body.error?.details?.flatMap((d) => d.errors ?? [])[0];
  const code = first?.errorCode ? Object.values(first.errorCode)[0] : undefined;
  const message = first?.message ?? body.error?.message ?? res.statusText;
  return new Error(`Google Ads API error ${res.status}${code ? ` ${code}` : ""}: ${message}`);
}

type GaqlRow = {
  customer?: { id?: string; descriptiveName?: string; currencyCode?: string; manager?: boolean };
  customerClient?: { id?: string; descriptiveName?: string; manager?: boolean; status?: string };
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

// Results come in fixed pages of 10,000 rows. The API has rejected pageSize
// with PAGE_SIZE_NOT_SUPPORTED since v17, so later pages are fetched with
// nextPageToken. Each page is one operation, and maxPages caps the spend.
async function gaql(accessToken: string, accountId: string, query: string, maxPages = 5): Promise<GaqlRow[]> {
  const { customerId, loginCustomerId } = parseGoogleAdsAccountId(accountId);
  const rows: GaqlRow[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const data = await withRetry(async () => {
      const res = await fetch(`${API}/customers/${customerId}/googleAds:search`, {
        method: "POST",
        headers: headers(accessToken, loginCustomerId),
        body: JSON.stringify(pageToken ? { query, pageToken } : { query }),
      });
      if (!res.ok) throw await adsError(res);
      return (await res.json()) as { results?: GaqlRow[]; nextPageToken?: string };
    });
    rows.push(...(data.results ?? []));
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return rows;
}

const micros = (v: string | undefined) => (v ? Number(v) / 1_000_000 : 0);
const num = (v: string | number | undefined) => (v ? Number(v) : 0);

// Lists the ad accounts the user can report on. listAccessibleCustomers only
// returns accounts the user was added to directly, which for an agency is
// usually just its manager account, so each manager is expanded into the
// client accounts under it (customer_client covers every level). Managers
// themselves are left out because they have no metrics of their own. An
// account that can't be read (cancelled, suspended, access removed) is skipped
// rather than failing the whole list.
export async function listGoogleAdsAccounts(accessToken: string): Promise<IntegrationAccount[]> {
  let roots: string[];
  try {
    roots = await withRetry(async () => {
      const res = await fetch(`${API}/customers:listAccessibleCustomers`, { headers: headers(accessToken) });
      if (!res.ok) throw await adsError(res);
      const data = (await res.json()) as { resourceNames?: string[] };
      return (data.resourceNames ?? []).map((n) => n.replace("customers/", ""));
    });
  } catch (err) {
    // A Google account with no Google Ads access at all: an empty list, not a failure.
    if (/NOT_ADS_USER/.test(String((err as Error).message))) return [];
    throw err;
  }

  const found = new Map<string, { account: IntegrationAccount; direct: boolean }>();
  const add = (id: string, name: string | undefined, root: string) => {
    const direct = id === root;
    const existing = found.get(id);
    // Prefer opening an account directly over going through a manager.
    if (existing && (existing.direct || !direct)) return;
    found.set(id, {
      account: { id: direct ? id : `${id}@${root}`, name: `${name || "Google Ads account"} (${formatCustomerId(id)})` },
      direct,
    });
  };

  const expand = async (root: string) => {
    const [self] = await gaql(accessToken, root, "SELECT customer.id, customer.descriptive_name, customer.manager FROM customer LIMIT 1");
    if (!self?.customer?.manager) {
      add(root, self?.customer?.descriptiveName, root);
      return;
    }
    const clients = await gaql(
      accessToken,
      root,
      "SELECT customer_client.id, customer_client.descriptive_name, customer_client.manager, customer_client.status FROM customer_client"
    );
    for (const { customerClient: c } of clients) {
      if (c?.id && !c.manager && c.status === "ENABLED") add(c.id, c.descriptiveName, root);
    }
  };

  // A few at a time: a user can hold dozens of accounts directly.
  const queue = [...roots];
  await Promise.all(
    Array.from({ length: Math.min(5, queue.length) }, async () => {
      for (let root = queue.shift(); root; root = queue.shift()) await expand(root).catch(() => {});
    })
  );

  return Array.from(found.values(), (f) => f.account).sort((a, b) => a.name.localeCompare(b.name));
}

// Fetches the normalized ads report for one account and period, plus the
// prior equal-length period for comparison. accountId is the id stored by
// listGoogleAdsAccounts (see parseGoogleAdsAccountId).
export async function fetchGoogleAdsReport(
  accessToken: string,
  accountId: string,
  periodDays: number
): Promise<AdsReport> {
  const since = isoDay(periodDays);
  const until = isoDay(1);
  const prevSince = isoDay(periodDays * 2);
  const prevUntil = isoDay(periodDays + 1);
  const metricsFields = "metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value";

  const [meta, dailyRows, prevRows, campaignRows] = await Promise.all([
    gaql(accessToken, accountId, "SELECT customer.currency_code FROM customer LIMIT 1").catch(() => [] as GaqlRow[]),
    gaql(accessToken, accountId,
      `SELECT segments.date, ${metricsFields} FROM customer WHERE segments.date BETWEEN '${since}' AND '${until}'`),
    gaql(accessToken, accountId,
      `SELECT ${metricsFields} FROM customer WHERE segments.date BETWEEN '${prevSince}' AND '${prevUntil}'`
    ).catch(() => [] as GaqlRow[]),
    gaql(accessToken, accountId,
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
    currency: meta[0]?.customer?.currencyCode ?? "",
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
