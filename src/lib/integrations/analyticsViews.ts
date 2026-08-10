// Which integrations have a dashboard chart view, and which view they use.
//
// This was previously duplicated: ClientAnalytics knew how to render 32 sources
// while the client page carried its own hardcoded HAS_VIZ gate listing only 24.
// The two drifted, so eight integrations with working renderers — including
// Microsoft Ads, WooCommerce, Stripe, Mailchimp, Klaviyo, CallRail, Ahrefs and
// Semrush — were silently dropped from the Performance section even after
// syncing real data.
//
// Both the renderer and the page now read this module, so a new integration
// becomes visible in Performance the moment it gains a view here. No id list
// lives anywhere else.

/** Paid media — all render through AdsAnalytics on the shared AdsReport shape. */
export const ADS_VIZ = new Set([
  "google_ads", "meta_ads", "linkedin_ads", "tiktok_ads", "microsoft_ads",
  "pinterest_ads", "snapchat_ads", "reddit_ads", "amazon_ads", "x_ads",
]);

/** Storefront / payments — CommerceAnalytics. */
export const COMMERCE_VIZ = new Set(["shopify", "woocommerce", "stripe"]);

/** Email marketing — EmailAnalytics. */
export const EMAIL_VIZ = new Set(["mailchimp", "klaviyo", "activecampaign", "constantcontact", "campaignmonitor"]);

/** SEO tools — SeoAnalytics. */
export const SEO_VIZ = new Set(["ahrefs", "semrush", "moz"]);

/** CRMs — CrmAnalytics. */
export const CRM_VIZ = new Set(["hubspot", "salesforce"]);

/** Sources with their own bespoke view. */
const SINGLE_VIZ = new Set([
  "gsc", "ga4", "adobe_analytics", "instagram", "gbp",
  "sheets", "bigquery", "callrail", "youtube_analytics",
]);

/**
 * True when this integration renders a chart block. The Performance section
 * gates on this AND on a real synced snapshot existing — a source with a view
 * but no data still shows nothing rather than placeholder analytics.
 */
// ── Metric groups ────────────────────────────────────────────
//
// Performance groups sources by the KIND of metric they carry, because metrics
// from different groups must never be combined: Search Console clicks and GA4
// sessions count different events, and neither can be added to ad spend. Only
// sources inside the same group are ever aggregated, and even then only where
// the maths is genuinely valid (see aggregatePaidSnapshots).
export type MetricGroup = "paid" | "seo" | "analytics" | "social" | "commerce" | "crm" | "email" | "calls" | "other";

export const GROUP_LABELS: Record<MetricGroup, string> = {
  paid: "Paid ads",
  seo: "SEO",
  analytics: "Website analytics",
  social: "Social",
  commerce: "E-commerce",
  crm: "CRM",
  email: "Email",
  calls: "Calls",
  other: "Other",
};

/** Search Console sits with the SEO tools; they all describe organic search. */
const SEO_GROUP = new Set(["gsc", "ahrefs", "semrush", "moz"]);
const ANALYTICS_GROUP = new Set(["ga4", "adobe_analytics", "gbp", "sheets", "bigquery", "youtube_analytics"]);
const SOCIAL_GROUP = new Set(["instagram"]);

export function groupForIntegration(id: string | null | undefined): MetricGroup {
  if (!id) return "other";
  if (ADS_VIZ.has(id)) return "paid";
  if (SEO_GROUP.has(id)) return "seo";
  if (ANALYTICS_GROUP.has(id)) return "analytics";
  if (SOCIAL_GROUP.has(id)) return "social";
  if (COMMERCE_VIZ.has(id)) return "commerce";
  if (CRM_VIZ.has(id)) return "crm";
  if (EMAIL_VIZ.has(id)) return "email";
  if (id === "callrail") return "calls";
  return "other";
}

export function hasAnalyticsView(id: string | null | undefined): boolean {
  if (!id) return false;
  return (
    SINGLE_VIZ.has(id) ||
    ADS_VIZ.has(id) ||
    COMMERCE_VIZ.has(id) ||
    EMAIL_VIZ.has(id) ||
    SEO_VIZ.has(id) ||
    CRM_VIZ.has(id)
  );
}
