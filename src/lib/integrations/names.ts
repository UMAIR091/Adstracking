// Client-safe integration display names (the registry itself pulls in server
// OAuth code, so client components import this tiny map instead).
const NAMES: Record<string, string> = {
  gsc: "Google Search Console",
  ga4: "Google Analytics 4",
  google_ads: "Google Ads",
  gbp: "Google Business Profile",
  meta_ads: "Meta Ads",
  linkedin_ads: "LinkedIn Ads",
  microsoft_ads: "Microsoft Ads",
  tiktok_ads: "TikTok Ads",
  x_twitter: "X (Twitter)",
  youtube: "YouTube",
};

export function getIntegrationName(id: string): string {
  return NAMES[id] ?? id.replace(/_/g, " ");
}
