// Integration descriptors. Live providers carry the full server behavior;
// "soon" providers are one-liners — adding one for real means filling in
// listAccounts/fetchSnapshot (+ an OAuth backend if non-Google) and flipping
// status to "live". No route, sync, or UI code changes are required.
import {
  listGscSites, fetchGscReportWithComparison, listGa4Properties, fetchGa4ReportWithComparison,
} from "@/lib/google";
import { listMetaAdAccounts, fetchMetaAdsReport } from "./oauth/meta";
import { listInstagramAccounts, fetchInstagramReport } from "./oauth/instagram";
import { listGoogleAdsAccounts, fetchGoogleAdsReport, googleAdsConfigured } from "./oauth/googleAds";
import { listGbpLocations, fetchGbpReport } from "./oauth/gbp";
import { fetchShopifyReport, shopifyConfigured } from "./oauth/shopify";
import { listSpreadsheets, fetchSheetTable } from "./oauth/sheets";
import { listHubspotAccounts, fetchHubspotReport, hubspotConfigured } from "./oauth/hubspot";
import { listLinkedinAdAccounts, fetchLinkedinAdsReport, linkedinConfigured } from "./oauth/linkedin";
import type { IntegrationDef, IntegrationConfig, IntegrationAccount } from "./types";

// Providers that need their own app credentials stay "soon" until the env
// vars exist, so the UI never offers a Connect that would 500.
const gated = (configured: boolean) => (configured ? ("live" as const) : ("soon" as const));

const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export const gscDef: IntegrationDef = {
  id: "gsc",
  name: "Google Search Console",
  description: "Clicks, impressions, queries & pages",
  icon: "Search",
  accent: "emerald",
  status: "live",
  oauthProviderId: "google",
  connectPath: "/api/google/connect",
  accountNoun: "property",
  accountConfigKey: "site_url",
  snapshotTable: "gsc_snapshots",
  dataAccess: [
    { item: "Search performance metrics (read-only)", why: "Clicks, impressions, CTR and average position power the SEO sections of your reports." },
    { item: "Top queries, pages, countries & devices", why: "Shows what your client ranks for and where their organic traffic comes from." },
    { item: "Your list of verified properties", why: "So you can pick which website this client's reports are built from." },
  ],
  listAccounts: async (at) => (await listGscSites(at)).map((s) => ({ id: s, name: s })),
  fetchSnapshot: (at, id, days) => fetchGscReportWithComparison(at, id, days),
  buildConfig: (accounts) => ({ sites: accounts.map((a) => a.id), site_url: accounts.length === 1 ? accounts[0].id : null }),
  readAccounts: (cfg) => arr<string>(cfg.sites).map((s) => ({ id: s, name: s })),
  readSelected: (cfg) => (cfg.site_url as string | null) ?? null,
};

export const ga4Def: IntegrationDef = {
  id: "ga4",
  name: "Google Analytics 4",
  description: "Traffic, engagement & conversions",
  icon: "BarChart3",
  accent: "amber",
  status: "live",
  oauthProviderId: "google",
  connectPath: "/api/google/connect",
  accountNoun: "property",
  accountConfigKey: "property_id",
  snapshotTable: "ga4_snapshots",
  dataAccess: [
    { item: "Traffic & engagement metrics (read-only)", why: "Users, sessions, engagement and conversions power the website-performance sections of your reports." },
    { item: "Landing pages, channels, devices & countries", why: "Shows where visitors come from and which pages perform best." },
    { item: "Your list of GA4 properties", why: "So you can pick which property this client's reports are built from." },
  ],
  listAccounts: async (at) => (await listGa4Properties(at)).map((p) => ({ id: p.id, name: p.account ? `${p.name} · ${p.account}` : p.name })),
  fetchSnapshot: (at, id, days) => fetchGa4ReportWithComparison(at, id, days),
  buildConfig: (accounts) => ({ properties: accounts.map((a) => ({ id: a.id, name: a.name })), property_id: accounts.length === 1 ? accounts[0].id : null }),
  readAccounts: (cfg) => arr<IntegrationAccount>(cfg.properties),
  readSelected: (cfg) => (cfg.property_id as string | null) ?? null,
};

// Future sources — generic snapshot home, generic account config key. Google
// ones reuse the existing OAuth backend + callback; others get their own later.
function soon(
  id: string, name: string, description: string, icon: string, accent: string,
  oauthProviderId: string | null = null, connectPath: string | null = null
): IntegrationDef {
  return {
    id, name, description, icon, accent, status: "soon",
    oauthProviderId, connectPath,
    accountNoun: "account", accountConfigKey: "account_id", snapshotTable: "integration_snapshots",
    readAccounts: (cfg) => arr<IntegrationAccount>((cfg as IntegrationConfig).accounts),
    readSelected: (cfg) => ((cfg as IntegrationConfig).account_id as string | null) ?? null,
  };
}

export const metaAdsDef: IntegrationDef = {
  id: "meta_ads",
  name: "Meta Ads",
  description: "Reach, spend, CPC & ROAS",
  icon: "Facebook",
  accent: "blue",
  status: "live",
  oauthProviderId: "meta",
  connectPath: "/api/meta/connect",
  accountNoun: "ad account",
  accountConfigKey: "account_id",
  snapshotTable: "integration_snapshots",
  dataAccess: [
    { item: "Ad performance metrics (read-only)", why: "Spend, impressions, clicks, CPC, reach and conversions power the paid-media sections of your reports." },
    { item: "Campaign-level results", why: "Shows which campaigns drive results in the client's report." },
    { item: "Your list of ad accounts", why: "So you can pick which ad account this client's reports are built from." },
  ],
  listAccounts: (at) => listMetaAdAccounts(at),
  fetchSnapshot: (at, id, days) => fetchMetaAdsReport(at, id, days),
  buildConfig: (accounts) => ({ accounts, account_id: accounts.length === 1 ? accounts[0].id : null }),
  readAccounts: (cfg) => arr<IntegrationAccount>((cfg as IntegrationConfig).accounts),
  readSelected: (cfg) => ((cfg as IntegrationConfig).account_id as string | null) ?? null,
};

// First social platform on the generic SocialReport shape (src/lib/integrations/
// social.ts). TikTok, LinkedIn, Pinterest, Facebook Pages etc. follow the same
// pattern: an OAuth backend + a fetcher that fills SocialReport, nothing else.
export const instagramDef: IntegrationDef = {
  id: "instagram",
  name: "Instagram",
  description: "Followers, reach, posts & engagement",
  icon: "Instagram",
  accent: "fuchsia",
  status: "live",
  oauthProviderId: "instagram",
  connectPath: "/api/meta/connect",
  accountNoun: "account",
  accountConfigKey: "account_id",
  snapshotTable: "integration_snapshots",
  dataAccess: [
    { item: "Profile & audience metrics (read-only)", why: "Followers, follower growth, reach, impressions, profile visits and website clicks power the social sections of your reports." },
    { item: "Posts, reels & story counts with engagement", why: "Likes, comments, shares and saves show which content performs for your client." },
    { item: "Your list of Instagram professional accounts", why: "So you can pick which account this client's reports are built from." },
  ],
  listAccounts: (at) => listInstagramAccounts(at),
  fetchSnapshot: (at, id, days) => fetchInstagramReport(at, id, days),
  buildConfig: (accounts) => ({ accounts, account_id: accounts.length === 1 ? accounts[0].id : null }),
  readAccounts: (cfg) => arr<IntegrationAccount>((cfg as IntegrationConfig).accounts),
  readSelected: (cfg) => ((cfg as IntegrationConfig).account_id as string | null) ?? null,
};

// Normalized paid-media source on the shared AdsReport shape (metrics.ts) —
// LinkedIn Ads and TikTok Ads fill the same shape, and AdsAnalytics renders all.
export const googleAdsDef: IntegrationDef = {
  id: "google_ads",
  name: "Google Ads",
  description: "Spend, clicks, conversions & ROAS",
  icon: "Megaphone",
  accent: "sky",
  status: gated(googleAdsConfigured()),
  oauthProviderId: "google_ads",
  connectPath: "/api/google/connect",
  accountNoun: "ad account",
  accountConfigKey: "account_id",
  snapshotTable: "integration_snapshots",
  dataAccess: [
    { item: "Ad performance metrics (read-only)", why: "Spend, impressions, clicks, CPC, conversions and conversion value power the paid-media sections of your reports." },
    { item: "Campaign-level results", why: "Shows which campaigns drive results in the client's report." },
    { item: "Your list of Google Ads accounts", why: "So you can pick which ad account this client's reports are built from." },
  ],
  listAccounts: (at) => listGoogleAdsAccounts(at),
  fetchSnapshot: (at, id, days) => fetchGoogleAdsReport(at, id, days),
  buildConfig: (accounts) => ({ accounts, account_id: accounts.length === 1 ? accounts[0].id : null }),
  readAccounts: (cfg) => arr<IntegrationAccount>((cfg as IntegrationConfig).accounts),
  readSelected: (cfg) => ((cfg as IntegrationConfig).account_id as string | null) ?? null,
};

// Local-presence metrics. Uses the shared Google OAuth app; the Google Cloud
// project needs the three Business Profile APIs enabled (access is approval-
// gated by Google — see .env.example notes).
export const gbpDef: IntegrationDef = {
  id: "gbp",
  name: "Google Business Profile",
  description: "Profile views, calls, directions & clicks",
  icon: "MapPin",
  accent: "rose",
  status: "live",
  oauthProviderId: "gbp",
  connectPath: "/api/google/connect",
  accountNoun: "location",
  accountConfigKey: "account_id",
  snapshotTable: "integration_snapshots",
  dataAccess: [
    { item: "Business Profile performance metrics (read-only)", why: "Profile impressions, website clicks, calls, direction requests and bookings power the local-presence sections of your reports." },
    { item: "Your list of business locations", why: "So you can pick which location this client's reports are built from." },
  ],
  listAccounts: (at) => listGbpLocations(at),
  fetchSnapshot: (at, id, days) => fetchGbpReport(at, id, days),
  buildConfig: (accounts) => ({ accounts, account_id: accounts.length === 1 ? accounts[0].id : null }),
  readAccounts: (cfg) => arr<IntegrationAccount>((cfg as IntegrationConfig).accounts),
  readSelected: (cfg) => ((cfg as IntegrationConfig).account_id as string | null) ?? null,
};

// Commerce source on the normalized CommerceReport shape. Shopify's OAuth is
// per-shop, so it uses dedicated connect/callback routes and a consent-screen
// input (connectField) for the store domain; the account IS the shop.
export const shopifyDef: IntegrationDef = {
  id: "shopify",
  name: "Shopify",
  description: "Orders, revenue & top products",
  icon: "ShoppingBag",
  accent: "emerald",
  status: gated(shopifyConfigured()),
  oauthProviderId: "shopify",
  connectPath: "/api/shopify/connect",
  accountNoun: "store",
  accountConfigKey: "account_id",
  snapshotTable: "integration_snapshots",
  dataAccess: [
    { item: "Orders & sales metrics (read-only)", why: "Order counts, revenue and average order value power the e-commerce sections of your reports." },
    { item: "Product line items", why: "Shows which products drive revenue in the client's report." },
  ],
  connectField: {
    name: "shop",
    label: "Store domain",
    placeholder: "your-store.myshopify.com",
    hint: "The store's .myshopify.com domain (the store owner approves access on Shopify).",
  },
  // The account is the shop itself — set at connect time by the callback.
  listAccounts: async () => [],
  fetchSnapshot: (at, shop, days) => fetchShopifyReport(at, shop, days),
  buildConfig: (accounts) => ({ accounts, account_id: accounts[0]?.id ?? null }),
  readAccounts: (cfg) => arr<IntegrationAccount>((cfg as IntegrationConfig).accounts),
  readSelected: (cfg) => ((cfg as IntegrationConfig).account_id as string | null) ?? null,
};

// Custom tabular data. The snapshot is the first worksheet as a bounded
// table — shown on the dashboard and embeddable in reports.
export const sheetsDef: IntegrationDef = {
  id: "sheets",
  name: "Google Sheets",
  description: "Custom data from your spreadsheets",
  icon: "FileSpreadsheet",
  accent: "emerald",
  status: "live",
  oauthProviderId: "sheets",
  connectPath: "/api/google/connect",
  accountNoun: "spreadsheet",
  accountConfigKey: "account_id",
  snapshotTable: "integration_snapshots",
  dataAccess: [
    { item: "The spreadsheet you select (read-only)", why: "Its first worksheet is embedded as a data table in this client's dashboard and reports." },
    { item: "Your list of spreadsheets (names only)", why: "So you can pick which spreadsheet this client's data comes from." },
  ],
  listAccounts: (at) => listSpreadsheets(at),
  fetchSnapshot: (at, id) => fetchSheetTable(at, id),
  buildConfig: (accounts) => ({ accounts: accounts.slice(0, 100), account_id: accounts.length === 1 ? accounts[0].id : null }),
  readAccounts: (cfg) => arr<IntegrationAccount>((cfg as IntegrationConfig).accounts),
  readSelected: (cfg) => ((cfg as IntegrationConfig).account_id as string | null) ?? null,
};

// CRM source on the normalized CrmReport shape (leads, deals, won revenue).
export const hubspotDef: IntegrationDef = {
  id: "hubspot",
  name: "HubSpot",
  description: "Leads, deals & won revenue",
  icon: "Magnet",
  accent: "amber",
  status: gated(hubspotConfigured()),
  oauthProviderId: "hubspot",
  connectPath: "/api/hubspot/connect",
  accountNoun: "portal",
  accountConfigKey: "account_id",
  snapshotTable: "integration_snapshots",
  dataAccess: [
    { item: "Contacts & deals activity (read-only)", why: "New leads, deals created and closed-won revenue power the pipeline sections of your reports." },
    { item: "Your HubSpot account id", why: "So the connection is tied to the right portal." },
  ],
  listAccounts: (at) => listHubspotAccounts(at),
  fetchSnapshot: (at, id, days) => fetchHubspotReport(at, id, days),
  buildConfig: (accounts) => ({ accounts, account_id: accounts[0]?.id ?? null }),
  readAccounts: (cfg) => arr<IntegrationAccount>((cfg as IntegrationConfig).accounts),
  readSelected: (cfg) => ((cfg as IntegrationConfig).account_id as string | null) ?? null,
};

// Second paid-media source on the shared AdsReport shape. Requires a LinkedIn
// app approved for the Marketing Developer Platform (see .env.example).
export const linkedinAdsDef: IntegrationDef = {
  id: "linkedin_ads",
  name: "LinkedIn Ads",
  description: "B2B spend, clicks & conversions",
  icon: "Linkedin",
  accent: "sky",
  status: gated(linkedinConfigured()),
  oauthProviderId: "linkedin",
  connectPath: "/api/linkedin/connect",
  accountNoun: "ad account",
  accountConfigKey: "account_id",
  snapshotTable: "integration_snapshots",
  dataAccess: [
    { item: "Ad performance metrics (read-only)", why: "Spend, impressions, clicks and conversions power the paid-media sections of your reports." },
    { item: "Campaign-level results", why: "Shows which campaigns drive results in the client's report." },
    { item: "Your list of LinkedIn ad accounts", why: "So you can pick which ad account this client's reports are built from." },
  ],
  listAccounts: (at) => listLinkedinAdAccounts(at),
  fetchSnapshot: (at, id, days) => fetchLinkedinAdsReport(at, id, days),
  buildConfig: (accounts) => ({ accounts, account_id: accounts.length === 1 ? accounts[0].id : null }),
  readAccounts: (cfg) => arr<IntegrationAccount>((cfg as IntegrationConfig).accounts),
  readSelected: (cfg) => ((cfg as IntegrationConfig).account_id as string | null) ?? null,
};

export const soonDefs: IntegrationDef[] = [
  soon("microsoft_ads", "Microsoft Ads", "Bing search spend & conversions", "Search", "cyan"),
  soon("tiktok_ads", "TikTok Ads", "Views, spend & conversions", "Music", "fuchsia"),
  soon("x_twitter", "X (Twitter)", "Impressions, engagements & spend", "Twitter", "ink"),
  soon("youtube", "YouTube", "Views, watch time & subscribers", "Youtube", "red"),
];
