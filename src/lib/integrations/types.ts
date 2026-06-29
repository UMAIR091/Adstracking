// Unified integration architecture. Every data source (Search Console, GA4, and
// future ad platforms) is described by an IntegrationDef; generic services
// (OAuth, token refresh, sync, UI) consume the registry so adding a source means
// writing a descriptor, not new plumbing.

export type TokenSet = { access_token: string; refresh_token?: string; expires_in: number };

// A pluggable OAuth backend, shared by every integration that authenticates
// through the same provider (e.g. all Google sources share one).
export type OAuthProvider = {
  id: string;
  authUrl(state: string): string;
  exchangeCode(code: string): Promise<TokenSet>;
  refresh(refreshToken: string): Promise<TokenSet>;
  identity(accessToken: string): Promise<string>;
  // Where the provider redirects back to (must match the OAuth app config).
  callbackPath: string;
};

// A selectable account/property/site exposed after connecting.
export type IntegrationAccount = { id: string; name: string };

export type IntegrationStatus = "live" | "soon";

export type IntegrationConfig = Record<string, unknown>;

export type IntegrationDef = {
  id: string; // matches data_sources.type
  name: string;
  description: string;
  icon: string; // lucide icon name (serializable for client components)
  accent: string; // theme key: emerald | amber | sky | rose | blue | cyan | fuchsia
  status: IntegrationStatus;
  oauthProviderId: string | null; // null until an OAuth backend exists
  connectPath: string | null; // route that starts the connect flow
  accountNoun: string; // "property" | "site" | "account"
  accountConfigKey: string; // config key that stores the selected account id
  snapshotTable: string | null; // where synced data is cached

  // ── server-only behavior (omit on "soon" providers) ──
  // List the accounts the authenticated user can pick from.
  listAccounts?(accessToken: string): Promise<IntegrationAccount[]>;
  // Fetch + shape the cached snapshot for one account and period.
  fetchSnapshot?(accessToken: string, accountId: string, periodDays: number): Promise<unknown>;
  // Build the initial config stored at connect time from the account list.
  buildConfig?(accounts: IntegrationAccount[]): IntegrationConfig;
  // Read the picklist and current selection back out of a stored config.
  readAccounts?(config: IntegrationConfig): IntegrationAccount[];
  readSelected?(config: IntegrationConfig): string | null;
};

// Serializable subset safe to pass into client components.
export type IntegrationDescriptor = {
  id: string;
  name: string;
  description: string;
  icon: string;
  accent: string;
  status: IntegrationStatus;
  connectPath: string | null;
  accountNoun: string;
};
