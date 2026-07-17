// The integration registry — single source of truth that generic services and
// UI read from. Adding a source = add a descriptor in providers.ts.
import { gscDef, ga4Def, metaAdsDef, instagramDef, googleAdsDef, gbpDef, shopifyDef, woocommerceDef, mailchimpDef, klaviyoDef, callrailDef, microsoftAdsDef, ahrefsDef, semrushDef, mozDef, stripeDef, youtubeAnalyticsDef, bigqueryDef, sheetsDef, hubspotDef, linkedinAdsDef, tiktokAdsDef, pinterestAdsDef, snapchatAdsDef, redditAdsDef, amazonAdsDef, xAdsDef, adobeAnalyticsDef, soonDefs } from "./providers";
import { googleOAuth, googleAdsOAuth, gbpOAuth, sheetsOAuth, youtubeOAuth, bigqueryOAuth } from "./oauth/google";
import { metaOAuth } from "./oauth/meta";
import { instagramOAuth } from "./oauth/instagram";
import { shopifyOAuth } from "./oauth/shopify";
import { woocommerceOAuth } from "./oauth/woocommerce";
import { mailchimpOAuth } from "./oauth/mailchimp";
import { hubspotOAuth } from "./oauth/hubspot";
import { linkedinOAuth } from "./oauth/linkedin";
import { tiktokOAuth } from "./oauth/tiktok";
import { microsoftAdsOAuth } from "./oauth/microsoftAds";
import { pinterestOAuth } from "./oauth/pinterest";
import { snapchatOAuth } from "./oauth/snapchat";
import { redditOAuth } from "./oauth/reddit";
import { amazonOAuth } from "./oauth/amazon";
import { adobeOAuth } from "./oauth/adobe";
import { stripeOAuth } from "./oauth/stripe";
import type { IntegrationDef, OAuthProvider, IntegrationDescriptor } from "./types";

const DEFS: IntegrationDef[] = [gscDef, ga4Def, googleAdsDef, metaAdsDef, instagramDef, gbpDef, shopifyDef, woocommerceDef, mailchimpDef, klaviyoDef, callrailDef, microsoftAdsDef, ahrefsDef, semrushDef, mozDef, stripeDef, youtubeAnalyticsDef, bigqueryDef, sheetsDef, hubspotDef, linkedinAdsDef, tiktokAdsDef, pinterestAdsDef, snapchatAdsDef, redditAdsDef, amazonAdsDef, xAdsDef, adobeAnalyticsDef, ...soonDefs];

const BY_ID: Record<string, IntegrationDef> = {};
for (const d of DEFS) BY_ID[d.id] = d;

const OAUTH: Record<string, OAuthProvider> = {
  google: googleOAuth,
  google_ads: googleAdsOAuth,
  gbp: gbpOAuth,
  sheets: sheetsOAuth,
  youtube_analytics: youtubeOAuth,
  bigquery: bigqueryOAuth,
  meta: metaOAuth,
  instagram: instagramOAuth,
  shopify: shopifyOAuth,
  woocommerce: woocommerceOAuth,
  mailchimp: mailchimpOAuth,
  hubspot: hubspotOAuth,
  linkedin: linkedinOAuth,
  tiktok: tiktokOAuth,
  microsoft: microsoftAdsOAuth,
  pinterest: pinterestOAuth,
  snapchat: snapchatOAuth,
  reddit: redditOAuth,
  amazon: amazonOAuth,
  adobe: adobeOAuth,
  stripe: stripeOAuth,
};

export function listIntegrations(): IntegrationDef[] {
  return DEFS;
}

export function liveIntegrations(): IntegrationDef[] {
  return DEFS.filter((d) => d.status === "live");
}

// Types the background sync can process (live + fetchable + has a snapshot
// table). The cron uses this so new integrations are synced automatically —
// hard-coding type lists in routes is how Meta Ads got silently skipped.
export function syncableTypes(): string[] {
  return liveIntegrations()
    .filter((d) => d.fetchSnapshot && d.snapshotTable)
    .map((d) => d.id);
}

export function getIntegration(id: string | null | undefined): IntegrationDef | undefined {
  return id ? BY_ID[id] : undefined;
}

export function getOAuthProvider(id: string | null | undefined): OAuthProvider | undefined {
  return id ? OAUTH[id] : undefined;
}

// The OAuth backend for a given data source type (used by token refresh + callback).
export function oauthForType(type: string | null | undefined): OAuthProvider | undefined {
  const def = getIntegration(type);
  return def ? getOAuthProvider(def.oauthProviderId) : undefined;
}

// Client-safe view (no functions) for passing into client components.
export function descriptor(d: IntegrationDef): IntegrationDescriptor {
  return {
    id: d.id, name: d.name, description: d.description, icon: d.icon,
    accent: d.accent, status: d.status, connectPath: d.connectPath, accountNoun: d.accountNoun,
  };
}

export type { IntegrationDef, IntegrationDescriptor, IntegrationAccount } from "./types";
