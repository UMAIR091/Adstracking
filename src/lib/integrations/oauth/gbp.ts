// Google Business Profile backend. Reuses the shared Google OAuth app with the
// business.manage scope. Locations are listed via the Account Management +
// Business Information APIs; metrics come from the Business Profile
// Performance API (all three must be enabled in Google Cloud, and GBP API
// access requires Google's approval for the project).
import type { IntegrationAccount } from "../types";
import { dayRange, isoDay, withRetry, type GbpDay, type GbpReport, type GbpTotals } from "../metrics";

const ACCOUNTS = "https://mybusinessaccountmanagement.googleapis.com/v1";
const INFO = "https://mybusinessbusinessinformation.googleapis.com/v1";
const PERF = "https://businessprofileperformance.googleapis.com/v1";

async function gbpGet<T>(url: string, accessToken: string): Promise<T> {
  return withRetry(async () => {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = (data as { error?: { message?: string } }).error?.message ?? `${res.status} ${res.statusText}`;
      throw new Error(`Business Profile API error: ${detail}`);
    }
    return data as T;
  });
}

// Lists every location across the user's GBP accounts. The location resource
// name ("locations/123") is the account id used by the Performance API.
export async function listGbpLocations(accessToken: string): Promise<IntegrationAccount[]> {
  const { accounts } = await gbpGet<{ accounts?: { name: string; accountName?: string }[] }>(
    `${ACCOUNTS}/accounts?pageSize=20`, accessToken
  );
  const out: IntegrationAccount[] = [];
  for (const account of accounts ?? []) {
    try {
      const { locations } = await gbpGet<{ locations?: { name: string; title?: string }[] }>(
        `${INFO}/${account.name}/locations?pageSize=100&readMask=name,title`, accessToken
      );
      for (const loc of locations ?? []) {
        out.push({ id: loc.name, name: loc.title ? `${loc.title}` : loc.name });
      }
    } catch (err) {
      console.error(`[gbp] listing locations for ${account.name}: ${(err as Error).message}`);
    }
  }
  return out;
}

// Daily metric keys the Performance API exposes → our normalized buckets.
const IMPRESSION_METRICS = [
  "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
  "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
  "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
  "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
];
const ACTION_METRICS = [
  "WEBSITE_CLICKS",
  "CALL_CLICKS",
  "BUSINESS_DIRECTION_REQUESTS",
  "BUSINESS_CONVERSATIONS",
  "BUSINESS_BOOKINGS",
];

type TimeSeries = {
  dailyMetric?: string;
  timeSeries?: { datedValues?: { date?: { year: number; month: number; day: number }; value?: string }[] };
};

function dateKey(d: { year: number; month: number; day: number } | undefined): string {
  if (!d) return "";
  return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

async function fetchSeries(
  accessToken: string, location: string, sinceIso: string, untilIso: string
): Promise<Map<string, Map<string, number>>> {
  const [sy, sm, sd] = sinceIso.split("-").map(Number);
  const [uy, um, ud] = untilIso.split("-").map(Number);
  const params = new URLSearchParams();
  for (const m of [...IMPRESSION_METRICS, ...ACTION_METRICS]) params.append("dailyMetrics", m);
  params.set("dailyRange.start_date.year", String(sy));
  params.set("dailyRange.start_date.month", String(sm));
  params.set("dailyRange.start_date.day", String(sd));
  params.set("dailyRange.end_date.year", String(uy));
  params.set("dailyRange.end_date.month", String(um));
  params.set("dailyRange.end_date.day", String(ud));

  const data = await gbpGet<{ multiDailyMetricTimeSeries?: { dailyMetricTimeSeries?: TimeSeries[] }[] }>(
    `${PERF}/${location}:fetchMultiDailyMetricsTimeSeries?${params.toString()}`, accessToken
  );

  // metric -> (date -> value)
  const byMetric = new Map<string, Map<string, number>>();
  for (const group of data.multiDailyMetricTimeSeries ?? []) {
    for (const series of group.dailyMetricTimeSeries ?? []) {
      const metric = series.dailyMetric ?? "";
      const dates = new Map<string, number>();
      for (const dv of series.timeSeries?.datedValues ?? []) {
        dates.set(dateKey(dv.date), Number(dv.value ?? 0));
      }
      byMetric.set(metric, dates);
    }
  }
  return byMetric;
}

function totalsFrom(byMetric: Map<string, Map<string, number>>): GbpTotals {
  const sum = (metric: string) => {
    let t = 0;
    byMetric.get(metric)?.forEach((v) => { t += v; });
    return t;
  };
  return {
    impressions: IMPRESSION_METRICS.reduce((s, m) => s + sum(m), 0),
    websiteClicks: sum("WEBSITE_CLICKS"),
    calls: sum("CALL_CLICKS"),
    directionRequests: sum("BUSINESS_DIRECTION_REQUESTS"),
    conversations: sum("BUSINESS_CONVERSATIONS"),
    bookings: sum("BUSINESS_BOOKINGS"),
  };
}

// Fetches the normalized local-presence report for one location and period,
// plus the prior equal-length period for comparison.
export async function fetchGbpReport(
  accessToken: string, location: string, periodDays: number
): Promise<GbpReport> {
  // The Performance API lags a few days; end the window 3 days back so the
  // most recent bucket isn't a misleading zero.
  const LAG = 3;
  const current = await fetchSeries(accessToken, location, isoDay(periodDays + LAG - 1), isoDay(LAG));
  let previousTotals: GbpTotals | null = null;
  try {
    const prev = await fetchSeries(accessToken, location, isoDay(periodDays * 2 + LAG - 1), isoDay(periodDays + LAG));
    previousTotals = totalsFrom(prev);
  } catch (err) {
    console.error(`[gbp] previous period fetch: ${(err as Error).message}`);
  }

  const value = (metric: string, date: string) => current.get(metric)?.get(date) ?? 0;
  const byDate: GbpDay[] = dayRange(periodDays, LAG).map((date) => ({
    date,
    impressions: IMPRESSION_METRICS.reduce((s, m) => s + value(m, date), 0),
    websiteClicks: value("WEBSITE_CLICKS", date),
    calls: value("CALL_CLICKS", date),
    directionRequests: value("BUSINESS_DIRECTION_REQUESTS", date),
  }));

  return { platform: "gbp", totals: totalsFrom(current), previousTotals, byDate };
}
