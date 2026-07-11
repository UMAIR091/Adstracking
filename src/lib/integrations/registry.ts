// The integration registry — single source of truth that generic services and
// UI read from. Adding a source = add a descriptor in providers.ts.
import { gscDef, ga4Def, metaAdsDef, instagramDef, googleAdsDef, soonDefs } from "./providers";
import { googleOAuth, googleAdsOAuth, gbpOAuth, sheetsOAuth } from "./oauth/google";
import { metaOAuth } from "./oauth/meta";
import { instagramOAuth } from "./oauth/instagram";
import type { IntegrationDef, OAuthProvider, IntegrationDescriptor } from "./types";

const DEFS: IntegrationDef[] = [gscDef, ga4Def, googleAdsDef, metaAdsDef, instagramDef, ...soonDefs];

const BY_ID: Record<string, IntegrationDef> = {};
for (const d of DEFS) BY_ID[d.id] = d;

const OAUTH: Record<string, OAuthProvider> = {
  google: googleOAuth,
  google_ads: googleAdsOAuth,
  gbp: gbpOAuth,
  sheets: sheetsOAuth,
  meta: metaOAuth,
  instagram: instagramOAuth,
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
