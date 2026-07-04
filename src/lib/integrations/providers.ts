// Integration descriptors. Live providers carry the full server behavior;
// "soon" providers are one-liners — adding one for real means filling in
// listAccounts/fetchSnapshot (+ an OAuth backend if non-Google) and flipping
// status to "live". No route, sync, or UI code changes are required.
import {
  listGscSites, fetchGscReportWithComparison, listGa4Properties, fetchGa4ReportWithComparison,
} from "@/lib/google";
import { listMetaAdAccounts, fetchMetaAdsReport } from "./oauth/meta";
import type { IntegrationDef, IntegrationConfig, IntegrationAccount } from "./types";

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

export const soonDefs: IntegrationDef[] = [
  soon("google_ads", "Google Ads", "Spend, clicks, conversions & ROAS", "Megaphone", "sky", "google", "/api/google/connect"),
  soon("gbp", "Google Business Profile", "Calls, directions, views & reviews", "MapPin", "rose", "google", "/api/google/connect"),
  soon("linkedin_ads", "LinkedIn Ads", "B2B reach, leads & spend", "Linkedin", "sky"),
  soon("microsoft_ads", "Microsoft Ads", "Bing search spend & conversions", "Search", "cyan"),
  soon("tiktok_ads", "TikTok Ads", "Views, spend & conversions", "Music", "fuchsia"),
  soon("x_twitter", "X (Twitter)", "Impressions, engagements & spend", "Twitter", "ink"),
  soon("youtube", "YouTube", "Views, watch time & subscribers", "Youtube", "red"),
];
