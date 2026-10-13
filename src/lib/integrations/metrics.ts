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
  cpm: number; // cost per 1,000 impressions
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

// Video engagement, where the platform reports it (TikTok, Meta, Snapchat…).
// Optional on AdsReport so platforms without video data are unaffected.
export type AdsVideoTotals = {
  views: number; // video plays started
  watched2s: number;
  watched6s: number;
  completions: number; // played to 100%
  completionRate: number; // 0..1, completions / views
};

export type AdsReport = {
  platform: string; // integration id, e.g. "google_ads"
  currency: string;
  totals: AdsTotals;
  previousTotals: AdsTotals | null; // prior equal-length period, best effort
  byDate: AdsDay[];
  topCampaigns: AdsCampaign[];
  // Deeper structure levels, where the platform exposes them. Optional so
  // snapshots synced before these existed still render, and so providers that
  // only report at campaign level need no change.
  topAdGroups?: AdsCampaign[];
  topAds?: AdsCampaign[];
  video?: AdsVideoTotals;
  /**
   * The inclusive dates requested, in the account's own calendar (see
   * adWindows). Optional: snapshots synced before it existed have none, and
   * readers infer the window from the sync time instead.
   */
  window?: { start: string; end: string };
  previousWindow?: { start: string; end: string } | null;
  /** The account time zone the window was computed in; null when unknown. */
  timeZone?: string | null;
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
    // CPM is per *thousand* impressions, so the ratio is scaled up by 1000.
    cpm: ratio(spend, impressions) * 1000,
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

// ── Email marketing (Mailchimp, Klaviyo) ────────────────────

export type EmailTotals = {
  subscribers: number; // current audience/list size
  newSubscribers: number; // added in the period
  unsubscribes: number;
  campaigns: number; // campaigns/flows sent in the period
  emailsSent: number;
  opens: number;
  openRate: number; // 0..1
  clicks: number;
  clickRate: number; // 0..1
};

export type EmailDay = { date: string; sent: number; opens: number; clicks: number };

export type EmailCampaign = { name: string; sentAt: string; sent: number; openRate: number; clickRate: number };

export type EmailReport = {
  platform: string; // integration id, e.g. "mailchimp"
  totals: EmailTotals;
  previousTotals: EmailTotals | null;
  byDate: EmailDay[];
  topCampaigns: EmailCampaign[];
};

// ── Call tracking (CallRail) ─────────────────────────────────

export type CallTotals = {
  calls: number;
  leads: number; // first-time callers
  answered: number;
  missed: number;
  avgDurationSec: number;
};

export type CallDay = { date: string; calls: number; leads: number };

export type CallSource = { name: string; calls: number };

export type CallReport = {
  platform: string; // integration id, e.g. "callrail"
  totals: CallTotals;
  previousTotals: CallTotals | null;
  byDate: CallDay[];
  topSources: CallSource[];
};

// ── Video (YouTube Analytics) ────────────────────────────────

export type VideoTotals = {
  views: number;
  watchTimeMinutes: number;
  avgViewDurationSec: number;
  subscribers: number; // current channel subscriber count
  subscribersGained: number;
  subscribersLost: number;
  likes: number;
  comments: number;
};

export type VideoDay = { date: string; views: number; watchTimeMinutes: number; subscribersGained: number };

// A ranked dimension slice (traffic source, country, or device) for the period.
export type VideoBreakdown = { label: string; views: number; watchTimeMinutes: number };
// A top-performing video with its resolved title.
export type VideoTopItem = { title: string; views: number; watchTimeMinutes: number };

export type VideoReport = {
  platform: "youtube_analytics";
  totals: VideoTotals;
  previousTotals: VideoTotals | null;
  byDate: VideoDay[];
  // Dimensional breakdowns — optional so snapshots synced before these existed
  // still render. Each is ranked by views, capped server-side.
  topVideos?: VideoTopItem[];
  trafficSources?: VideoBreakdown[];
  geography?: VideoBreakdown[];
  devices?: VideoBreakdown[];
};

// ── SEO / organic search (Ahrefs, Semrush) ──────────────────
// Point-in-time domain metrics (not a daily series), so there's no byDate.

export type SeoTotals = {
  organicKeywords: number;
  organicTraffic: number; // estimated monthly organic visits
  backlinks: number;
  referringDomains: number;
  domainRating: number; // 0..100 (Ahrefs Domain Rating / Semrush Authority Score)
};

export type SeoKeyword = { keyword: string; position: number; volume: number; traffic: number };

export type SeoReport = {
  platform: string; // integration id, e.g. "ahrefs"
  target: string; // the analyzed domain
  totals: SeoTotals;
  previousTotals: SeoTotals | null;
  topKeywords: SeoKeyword[];
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
  platform: string; // integration id — "sheets" or "bigquery" (custom tabular data)
  title: string; // spreadsheet name
  sheetTitle: string; // first worksheet
  url: string | null;
  headers: string[];
  rows: string[][]; // capped server-side
  totalRows: number;
};

// ── Data warehouse (BigQuery) ────────────────────────────────
// A read-only view of one selected BigQuery table/view: its metadata + schema
// plus a bounded preview from a read-only SQL query (or tabledata fallback).
// When no table is selected yet, `overview` lists the datasets/tables available
// in the project so the connection still renders something useful.

export type BigQuerySchemaField = { name: string; type: string; mode: string };

export type BigQueryReport = {
  platform: "bigquery";
  projectId: string;
  datasetId: string | null;
  tableId: string | null;
  tableType: string | null; // TABLE | VIEW | MATERIALIZED_VIEW | EXTERNAL
  numRows: number | null; // total rows in the table (null for views)
  sizeBytes: number | null; // logical bytes (null for views)
  lastModified: string | null; // ISO timestamp of the last table modification
  schema: BigQuerySchemaField[];
  headers: string[]; // preview column names
  rows: string[][]; // read-only preview rows, capped server-side
  totalRows: number; // rows returned in the preview
  querySql: string | null; // the read-only SQL executed for the preview, if any
  url: string; // BigQuery console deep link
  overview: { dataset: string; table: string; type: string }[] | null;
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

// ── Ad-account day windows ───────────────────────────────────
//
// Ad platforms bucket their daily figures by the AD ACCOUNT's calendar, not
// UTC. Windows used to end on "yesterday in UTC", which at the 06:00 UTC sync
// is still in progress for any account west of UTC (23:00 the day before in
// Los Angeles), so a US account's newest day was a partial one: its totals,
// its last chart point and its archived row all came up short until a later
// sync happened to overwrite them.
//
// A window now ends on the newest day that has FULLY ended in the account's
// own time zone. When the zone is unknown it ends on the newest day that has
// ended everywhere (UTC−12): sometimes a day staler than necessary, never a
// partial day. The previous window is the equal-length block right before.

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function shiftDay(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Today's calendar date in an IANA time zone, or null for an unknown zone. */
export function localToday(timeZone: string | null | undefined, now: number = Date.now()): string | null {
  if (!timeZone) return null;
  try {
    const d = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
    return ISO_DAY.test(d) ? d : null;
  } catch {
    return null; // RangeError: not a zone this runtime knows
  }
}

/** The newest calendar day that has fully ended in `timeZone` (see above). */
export function lastCompleteDay(timeZone?: string | null, now: number = Date.now()): string {
  const local = localToday(timeZone, now);
  if (local) return shiftDay(local, -1);
  // Unknown zone: a day has ended everywhere once it has ended at UTC−12.
  return shiftDay(new Date(now - 12 * 60 * 60 * 1000).toISOString().slice(0, 10), -1);
}

export type AdWindows = {
  since: string;
  until: string;
  prevSince: string;
  prevUntil: string;
  /** Every date of the current window, oldest first, for zero-filling. */
  days: string[];
  /** The zone the window was computed in, when it was known. */
  timeZone: string | null;
};

/** A periodDays-long window ending on the account's last complete day. */
export function adWindows(periodDays: number, timeZone?: string | null, now: number = Date.now()): AdWindows {
  const until = lastCompleteDay(timeZone, now);
  const since = shiftDay(until, -(periodDays - 1));
  const prevUntil = shiftDay(since, -1);
  const prevSince = shiftDay(prevUntil, -(periodDays - 1));
  const days: string[] = [];
  for (let d = since; d <= until; d = shiftDay(d, 1)) days.push(d);
  return { since, until, prevSince, prevUntil, days, timeZone: localToday(timeZone, now) ? timeZone! : null };
}

/** The window fields an AdsReport records about itself. */
export function windowFields(w: AdWindows, hasPrevious: boolean): Pick<AdsReport, "window" | "previousWindow" | "timeZone"> {
  return {
    window: { start: w.since, end: w.until },
    previousWindow: hasPrevious ? { start: w.prevSince, end: w.prevUntil } : null,
    timeZone: w.timeZone,
  };
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
