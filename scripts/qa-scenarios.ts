// The four data-volume scenarios the adaptive composition system has to handle,
// shared by the PDF and web QA harnesses so both surfaces are checked against
// the same data.
//
//   1-sparse             barely any data across two sources
//   2-one-channel-rich   a single source carrying a lot
//   3-multi-moderate     several channels, moderate depth
//   4-rich-multi         several channels, all deep, with AI insights
//
// Scenario 4's insights deliberately include the artefacts a model actually
// emits — a bare "1", its own list numbering, a duplicate of an evidence-backed
// step — so the cleaning in lib/reports/commentary.ts is exercised by a real
// render and not only by its tests.
import type { ReportBlock } from "../src/lib/integrations/blocks";

export const BRANDING = {
  name: "Northstar Digital",
  brand_color: "#4e56b0",
  website: "northstar.example",
  footer_text: "Confidential — prepared for the named client only.",
  contact_email: null,
  logo_url: null,
};

export const PERIOD = { start: "2026-07-01", end: "2026-07-31" };
export const CLIENT = "Acme Running Co.";

function series(n: number, base: number, step: number): string[] {
  return Array.from({ length: n }, (_, i) => `2026-07-${String(i + 1).padStart(2, "0")}`).slice(0, n).map((d) => d);
}

const days31 = series(31, 0, 0);

// ── Source fixtures ─────────────────────────────────────────────────────────

const richGsc = {
  totals: { clicks: 14841, impressions: 302371, ctr: 0.049, position: 9.8 },
  previousTotals: { clicks: 11968, impressions: 269974, ctr: 0.044, position: 11.4 },
  topQueries: Array.from({ length: 8 }, (_, i) => ({
    key: `running shoes ${i}`,
    clicks: 900 - i * 40,
    impressions: 12000 - i * 300,
    ctr: 0.06,
    position: 3 + i,
  })),
  topPages: Array.from({ length: 5 }, (_, i) => ({
    key: `https://acme.example/p${i}`,
    clicks: 700 - i * 90,
    impressions: 9000 - i * 700,
    ctr: 0.05,
    position: 4 + i,
  })),
  topCountries: [],
  topDevices: [],
  byDate: days31.map((date, i) => ({
    date,
    clicks: 380 + i * 12,
    impressions: 8200 + i * 180,
    ctr: 0.047,
    position: 10.4 - i * 0.05,
  })),
  movers: {
    winners: [{ key: "carbon plate shoes", clicks: 300, prevClicks: 124, changePct: 141.9, position: 4.8 }],
    decliners: [{ key: "cheap shoes", clicks: 90, prevClicks: 145, changePct: -37.9, position: 12.4 }],
    opportunities: [{ key: "shoes for beginners", clicks: 40, impressions: 8200, position: 10.8 }],
  },
};

const sparseGsc = {
  totals: { clicks: 0, impressions: 2, ctr: 0, position: 6.5 },
  previousTotals: null,
  topQueries: [],
  topPages: [],
  topCountries: [],
  topDevices: [],
  byDate: [
    { date: "2026-07-29", clicks: 0, impressions: 1, ctr: 0, position: 7 },
    { date: "2026-07-30", clicks: 0, impressions: 0, ctr: 0, position: 6 },
    { date: "2026-07-31", clicks: 0, impressions: 1, ctr: 0, position: 6.5 },
  ],
  movers: null,
};

const richGa4 = {
  totals: {
    users: 22000, newUsers: 15000, sessions: 31000, engagedSessions: 21080,
    engagementRate: 0.68, avgEngagementTime: 96, views: 74000,
    conversions: 640, totalRevenue: 48000,
  },
  previousTotals: {
    users: 18900, newUsers: 13000, sessions: 27000, engagedSessions: 17280,
    engagementRate: 0.64, avgEngagementTime: 91, views: 65000,
    conversions: 520, totalRevenue: 40000,
  },
  byDate: days31.map((date, i) => ({ date, users: 660 + i * 9, sessions: 940 + i * 14, views: 2200 + i * 30 })),
  topLandingPages: [
    { key: "/shoes", sessions: 5000, users: 4000 },
    { key: "/sale", sessions: 3000, users: 2500 },
    { key: "/blog/pace-guide", sessions: 1800, users: 1610 },
  ],
  trafficSources: [
    { key: "Organic Search", sessions: 15000, users: 11200 },
    { key: "Paid Search", sessions: 8000, users: 6900 },
    { key: "Paid Social", sessions: 4600, users: 4100 },
  ],
  devices: [
    { key: "mobile", sessions: 19000, users: 13800 },
    { key: "desktop", sessions: 10000, users: 7100 },
  ],
  countries: [
    { key: "United States", sessions: 18000, users: 12900 },
    { key: "Canada", sessions: 6000, users: 4300 },
  ],
};

/** A paid block as lib/integrations/blocks would project it. */
function adsBlock(opts: {
  sourceId: string;
  sourceName: string;
  spend: number;
  prevSpend: number | null;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue?: number;
  costPerConversion?: number | null;
  prevCostPerConversion?: number | null;
  withSeries?: boolean;
  campaigns?: number;
}): ReportBlock {
  const {
    sourceId, sourceName, spend, prevSpend, impressions, clicks, conversions,
    revenue, costPerConversion, prevCostPerConversion, withSeries = false, campaigns = 0,
  } = opts;
  const kpis: ReportBlock["kpis"] = [
    { label: "Spend", value: spend, previous: prevSpend, format: "currency" },
    { label: "Impressions", value: impressions, previous: null, format: "number" },
    { label: "Clicks", value: clicks, previous: null, format: "number" },
    { label: "Conversions", value: conversions, previous: null, format: "number" },
    { label: "CPC", value: clicks > 0 ? spend / clicks : null, previous: null, format: "currency", lowerBetter: true },
  ];
  if (costPerConversion !== undefined) {
    kpis.push({ label: "Cost per conversion", value: costPerConversion, previous: prevCostPerConversion ?? null, format: "currency", lowerBetter: true });
  }
  if (revenue !== undefined) {
    kpis.push({ label: "Revenue", value: revenue, previous: null, format: "currency" });
    kpis.push({ label: "ROAS", value: spend > 0 ? revenue / spend : null, previous: null, format: "number" });
  }
  return {
    sourceId,
    sourceName,
    category: "paid",
    currency: "USD",
    kpis,
    series: withSeries
      ? [
          { label: "Spend", format: "currency", points: days31.map((date, i) => ({ date, value: 118 + i * 1.2 })) },
          { label: "Clicks", format: "number", points: days31.map((date, i) => ({ date, value: 85 + i * 2.3 })) },
        ]
      : [],
    tables: campaigns
      ? [
          {
            title: "Top campaigns",
            columns: [
              { key: "name", label: "Campaign", format: "number" },
              { key: "spend", label: "Spend", format: "currency" },
              { key: "clicks", label: "Clicks", format: "number" },
              { key: "conversions", label: "Conversions", format: "number" },
            ],
            rows: Array.from({ length: campaigns }, (_, i) => ({
              name: `${sourceName} campaign ${i + 1}`,
              spend: 900 - i * 100,
              clicks: 600 - i * 70,
              conversions: Math.max(0, 34 - i * 6),
            })),
          },
        ]
      : [],
    notes: [],
  };
}


const days7 = Array.from({ length: 7 }, (_, i) => `2026-07-${String(i + 1).padStart(2, "0")}`);

export const SHORT_PERIOD = { start: "2026-07-01", end: "2026-07-07" };

const shortGsc = {
  totals: { clicks: 412, impressions: 9800, ctr: 0.042, position: 12.1 },
  previousTotals: { clicks: 385, impressions: 9200, ctr: 0.042, position: 12.4 },
  topQueries: Array.from({ length: 4 }, (_, i) => ({
    key: `running shoes ${i}`, clicks: 90 - i * 15, impressions: 1400 - i * 200, ctr: 0.06, position: 5 + i,
  })),
  topPages: [{ key: "https://acme.example/shoes", clicks: 180, impressions: 3200, ctr: 0.056, position: 5.2 }],
  topCountries: [], topDevices: [],
  byDate: days7.map((date, i) => ({ date, clicks: 55 + i * 2, impressions: 1350 + i * 20, ctr: 0.041, position: 12.3 - i * 0.05 })),
  movers: { winners: [], decliners: [], opportunities: [] },
};

const shortGa4 = {
  totals: {
    users: 640, newUsers: 470, sessions: 880, engagedSessions: 560,
    engagementRate: 0.636, avgEngagementTime: 71, views: 2100, conversions: 14, totalRevenue: 1180,
  },
  previousTotals: {
    users: 610, newUsers: 450, sessions: 840, engagedSessions: 520,
    engagementRate: 0.619, avgEngagementTime: 68, views: 1980, conversions: 12, totalRevenue: 990,
  },
  byDate: days7.map((date, i) => ({ date, users: 88 + i, sessions: 122 + i * 2, views: 295 + i * 3 })),
  topLandingPages: [{ key: "/shoes", sessions: 340, users: 280 }],
  trafficSources: [
    { key: "Organic Search", sessions: 520, users: 410 },
    { key: "Paid Social", sessions: 210, users: 180 },
  ],
  devices: [{ key: "mobile", sessions: 610, users: 450 }],
  countries: [{ key: "United States", sessions: 700, users: 520 }],
};

const meta = (over: Record<string, unknown> = {}) => ({
  periodDays: 31,
  requested: PERIOD,
  coverage: PERIOD,
  ...over,
});

// ── Scenarios ───────────────────────────────────────────────────────────────

export const SCENARIOS: { name: string; title: string; data: unknown; period?: { start: string; end: string } }[] = [
  {
    name: "1-sparse",
    title: "Acme Running Co — Cross-Channel Report · July 2026",
    data: {
      gsc: sparseGsc,
      ga4: null,
      blocks: [
        adsBlock({
          sourceId: "meta_ads", sourceName: "Meta Ads",
          spend: 228, prevSpend: null, impressions: 1295, clicks: 0, conversions: 0,
        }),
      ],
      insights: null,
      meta: meta({
        reportType: "cross_channel",
        coverage: { start: "2026-07-29", end: "2026-07-31" },
        unavailable: [{
          section: "Top queries and pages",
          reason: "These are reported per period rather than per day, so they cannot be rebuilt for a custom date range.",
        }],
      }),
    },
  },
  {
    name: "2-one-channel-rich",
    title: "Acme Running Co — SEO Report · July 2026",
    data: {
      gsc: richGsc,
      ga4: null,
      blocks: [],
      insights: null,
      meta: meta({ reportType: "seo" }),
    },
  },
  {
    name: "3-multi-moderate",
    title: "Acme Running Co — Paid Media Report · July 2026",
    data: {
      gsc: null,
      ga4: null,
      blocks: [
        adsBlock({
          sourceId: "meta_ads", sourceName: "Meta Ads",
          spend: 4200, prevSpend: 3780, impressions: 480000, clicks: 3100, conversions: 120,
          revenue: 12600, costPerConversion: 35, prevCostPerConversion: 42,
          withSeries: true, campaigns: 6,
        }),
        adsBlock({
          sourceId: "tiktok_ads", sourceName: "TikTok Ads",
          spend: 228, prevSpend: null, impressions: 1295, clicks: 0, conversions: 0,
        }),
      ],
      insights: null,
      meta: meta({ reportType: "paid" }),
    },
  },
  {
    name: "4-rich-multi",
    title: "Acme Running Co — Cross-Channel Report · July 2026",
    data: {
      gsc: richGsc,
      ga4: richGa4,
      blocks: [
        adsBlock({
          sourceId: "meta_ads", sourceName: "Meta Ads",
          spend: 4200, prevSpend: 3780, impressions: 480000, clicks: 3100, conversions: 120,
          revenue: 12600, costPerConversion: 35, prevCostPerConversion: 42,
          withSeries: true, campaigns: 6,
        }),
        adsBlock({
          sourceId: "tiktok_ads", sourceName: "TikTok Ads",
          spend: 2600, prevSpend: 2400, impressions: 310000, clicks: 2050, conversions: 41,
          revenue: 3400, costPerConversion: 63, prevCostPerConversion: 60,
          withSeries: true, campaigns: 6,
        }),
      ],
      insights: {
        executiveSummary:
          "Organic search grew 24% to 14,841 clicks while paid media held spend flat and improved return, taking tracked revenue to $48,000 (up 20%).",
        keyWins: [
          "1. Carbon plate shoes up 142% to 300 clicks at position 4.8",
          "Revenue up 20% to $48,000 on a 2.1% conversion rate",
        ],
        // Deliberately dirty: a bare ordinal, a duplicate, and list numbering.
        issuesDetected: ["Cheap shoes down 38% from 145 to 90 clicks", "2"],
        growthOpportunities: ["“Shoes for beginners” sits at position 10.8 on 8,200 impressions"],
        recommendedActions: [
          "1",
          "1. Publish a beginners buying guide targeting the position-10.8 cluster and interlink it from the two strongest blog posts.",
          "- ",
          "Publish a beginners buying guide targeting the position-10.8 cluster and interlink it from the two strongest blog posts.",
          "3) Shift a share of the TikTok Ads budget to Meta Ads, where a conversion costs $35 against $63.",
        ],
      },
      meta: meta({ reportType: "cross_channel" }),
    },
  },
  {
    name: "5-short-period",
    title: "Acme Running Co — SEO Report · 1–7 July 2026",
    period: SHORT_PERIOD,
    data: {
      gsc: shortGsc,
      ga4: shortGa4,
      blocks: [
        adsBlock({
          sourceId: "meta_ads", sourceName: "Meta Ads",
          spend: 310, prevSpend: 290, impressions: 22400, clicks: 180, conversions: 6,
        }),
      ],
      insights: null,
      meta: {
        periodDays: 7,
        requested: SHORT_PERIOD,
        coverage: SHORT_PERIOD,
        reportType: "cross_channel",
        periodLabel: "Last 7 days",
      },
    },
  },
];
