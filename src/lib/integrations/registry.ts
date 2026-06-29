// The integration registry — single source of truth that generic services and
// UI read from. Adding a source = add a descriptor in providers.ts.
import { gscDef, ga4Def, soonDefs } from "./providers";
import { googleOAuth } from "./oauth/google";
import type { IntegrationDef, OAuthProvider, IntegrationDescriptor } from "./types";

const DEFS: IntegrationDef[] = [gscDef, ga4Def, ...soonDefs];

const BY_ID: Record<string, IntegrationDef> = {};
for (const d of DEFS) BY_ID[d.id] = d;

const OAUTH: Record<string, OAuthProvider> = { google: googleOAuth };

export function listIntegrations(): IntegrationDef[] {
  return DEFS;
}

export function liveIntegrations(): IntegrationDef[] {
  return DEFS.filter((d) => d.status === "live");
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
