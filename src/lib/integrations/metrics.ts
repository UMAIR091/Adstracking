// Normalized cross-platform report shapes. Every provider maps its native API
// response into one of these, so dashboards and reports read the same metrics
// (spend, clicks, impressions, CTR, CPC, conversions, CPA, revenue, ROAS,
// orders, leads) regardless of platform. Metrics a platform can't provide
// stay 0 and the UI omits or de-emphasizes them.
//
//   AdsReport      — paid media (Google Ads, Meta Ads, LinkedIn Ads, TikTok Ads)
//   CommerceReport — storefronts (Shopify)
//   CrmReport      — CRMs (HubSpot)
//   GbpReport      — local presence (Google Business Profile)
//   SheetTable     — custom tabular data (Google Sheets)

// ── Paid media ───────────────────────────────────────────────

export type AdsTotals = {
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number; // 0..1
  cpc: number;
  conversions: number;
  costPerConversion: number; // CPA
  revenue: number; // conversion value where the platform reports it
  roas: number; // revenue / spend
};

export type AdsDay = { date: string; spend: number; impressions: number; clicks: number; conversions: number };

export type AdsCampaign = {
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  conversions: number;
};

export type AdsReport = {
  platform: string; // integration id, e.g. "google_ads"
  currency: string;
  totals: AdsTotals;
  previousTotals: AdsTotals | null; // prior equal-length period, best effort
  byDate: AdsDay[];
  topCampaigns: AdsCampaign[];
};

export function adsTotals(rows: AdsDay[], revenue = 0): AdsTotals {
  const spend = rows.reduce((s, r) => s + r.spend, 0);
  const impressions = rows.reduce((s, r) => s + r.impressions, 0);
  const clicks = rows.reduce((s, r) => s + r.clicks, 0);
  const conversions = rows.reduce((s, r) => s + r.conversions, 0);
  return {
    spend, impressions, clicks, conversions, revenue,
    ctr: ratio(clicks, impressions),
    cpc: ratio(spend, clicks),
    costPerConversion: ratio(spend, conversions),
    roas: ratio(revenue, spend),
  };
}

// ── Commerce ─────────────────────────────────────────────────

export type CommerceTotals = {
  orders: number;
  revenue: number;
  avgOrderValue: number;
  customers: number; // distinct customers in the period (0 when unavailable)
};

export type CommerceDay = { date: string; orders: number; revenue: number };

export type CommerceProduct = { name: string; quantity: number; revenue: number };

export type CommerceReport = {
  platform: string;
  currency: string;
  totals: CommerceTotals;
  previousTotals: CommerceTotals | null;
  byDate: CommerceDay[];
  topProducts: CommerceProduct[];
};

// ── CRM ──────────────────────────────────────────────────────

export type CrmTotals = {
  newContacts: number; // leads
  newDeals: number;
  wonDeals: number;
  wonRevenue: number;
};

export type CrmDay = { date: string; contacts: number; deals: number };

export type CrmDeal = { name: string; amount: number; stage: string; createdAt: string };

export type CrmReport = {
  platform: string;
  currency: string;
  totals: CrmTotals;
  previousTotals: CrmTotals | null;
  byDate: CrmDay[];
  topDeals: CrmDeal[];
};

// ── Local presence (Google Business Profile) ─────────────────

export type GbpTotals = {
  impressions: number; // search + maps profile views
  websiteClicks: number;
  calls: number;
  directionRequests: number;
  conversations: number;
  bookings: number;
};

export type GbpDay = { date: string; impressions: number; websiteClicks: number; calls: number; directionRequests: number };

export type GbpReport = {
  platform: "gbp";
  totals: GbpTotals;
  previousTotals: GbpTotals | null;
  byDate: GbpDay[];
};

// ── Custom tabular data (Google Sheets) ──────────────────────

export type SheetTable = {
  platform: "sheets";
  title: string; // spreadsheet name
  sheetTitle: string; // first worksheet
  url: string | null;
  headers: string[];
  rows: string[][]; // capped server-side
  totalRows: number;
};

// ── Shared helpers ───────────────────────────────────────────

export function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function isoDay(offsetDays: number): string {
  return new Date(Date.now() - offsetDays * DAY_MS).toISOString().slice(0, 10);
}

// Inclusive list of YYYY-MM-DD dates for a period ending yesterday — used to
// zero-fill daily series so charts don't skip days the API omits.
export function dayRange(periodDays: number, endOffset = 1): string[] {
  const out: string[] = [];
  for (let i = periodDays + endOffset - 1; i >= endOffset; i--) out.push(isoDay(i));
  return out;
}

// Retry helper for transient provider failures (rate limits, 5xx). Retries on
// errors marked retryable by the caller's fetcher; backs off exponentially.
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseDelayMs = 800): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = String((err as Error).message ?? "");
      const retryable = /\b(429|500|502|503|504|rate.?limit|too many requests|timeout|ECONNRESET)\b/i.test(msg);
      if (!retryable || i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** i));
    }
  }
  throw lastErr;
}
