// Client-safe integration display names (the registry itself pulls in server
// OAuth code, so client components import this tiny map instead).
//
// This must cover EVERY id in providers.ts. It used to hold only 10 entries and
// fall back to `id.replace(/_/g," ")`, so anything missing surfaced to users as
// a lower-cased database key — the clients list rendered "instagram",
// "pinterest_ads" and "meta_ads" next to a correctly-named "Search Console".
// `names.test.ts` asserts this map stays in step with the registry, so adding a
// provider without a name here fails the test rather than leaking a key.
const NAMES: Record<string, string> = {
  gsc: "Google Search Console",
  ga4: "Google Analytics 4",
  google_ads: "Google Ads",
  gbp: "Google Business Profile",
  meta_ads: "Meta Ads",
  instagram: "Instagram",
  linkedin_ads: "LinkedIn Ads",
  microsoft_ads: "Microsoft Ads",
  tiktok_ads: "TikTok Ads",
  pinterest_ads: "Pinterest Ads",
  snapchat_ads: "Snapchat Ads",
  reddit_ads: "Reddit Ads",
  amazon_ads: "Amazon Ads",
  x_ads: "X Ads",
  x_twitter: "X (Twitter)",
  youtube: "YouTube",
  youtube_analytics: "YouTube Analytics",
  shopify: "Shopify",
  woocommerce: "WooCommerce",
  sheets: "Google Sheets",
  bigquery: "Google BigQuery",
  stripe: "Stripe",
  mailchimp: "Mailchimp",
  klaviyo: "Klaviyo",
  callrail: "CallRail",
  ahrefs: "Ahrefs",
  semrush: "Semrush",
  moz: "Moz",
  hubspot: "HubSpot",
  salesforce: "Salesforce",
  adobe_analytics: "Adobe Analytics",
  activecampaign: "ActiveCampaign",
  constantcontact: "Constant Contact",
  campaignmonitor: "Campaign Monitor",
};

// Last-resort fallback for an id with no entry: Title Case rather than a raw
// key, so an unmapped provider degrades to "Some Provider", never "some_provider".
function titleCase(id: string): string {
  return id
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getIntegrationName(id: string): string {
  return NAMES[id] ?? titleCase(id);
}

/** Ids this map knows about — used by the drift test. */
export function mappedIntegrationIds(): string[] {
  return Object.keys(NAMES);
}
