// Shared agency sign-ins (migration 0046). A connection holds one saved
// sign-in (encrypted tokens + who signed in) for an agency and integration
// type; each client's data_source points at the sign-in it uses and keeps its
// own account selection and sync state. So a second client reuses a sign-in by
// picking its account, and one reconnect renews every client on it.
//
// Tenants can read sign-ins but never their tokens, so everything here that
// touches tokens uses the service-role client. Callers authorize first (an
// RLS-scoped read of the client or data source) and pass verified ids in.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { encrypt } from "@/lib/crypto";
import type { IntegrationConfig, IntegrationDef } from "./types";
import type { SyncableSource } from "@/lib/sync";

export type ConnectionTokens = {
  id: string;
  identity_provider: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  status?: string | null;
};

const CONNECTION_TOKEN_FIELDS = "id, identity_provider, access_token, refresh_token, token_expires_at, status";

// Everything sync and token refresh need about a source, with its sign-in.
// Service role only: the joined token columns aren't readable by tenants.
export const SYNCABLE_SELECT =
  `id, agency_id, client_id, type, config, connection_id, access_token, refresh_token, token_expires_at, ` +
  `connection:connections!data_sources_connection_fkey(${CONNECTION_TOKEN_FIELDS})`;

type SyncableRow = Omit<SyncableSource, "connection"> & { connection: ConnectionTokens | ConnectionTokens[] | null };

// PostgREST returns a to-one embed as an object, but normalize defensively.
export function toSyncable(row: SyncableRow): SyncableSource {
  const c = Array.isArray(row.connection) ? row.connection[0] ?? null : row.connection;
  return { ...row, connection: c };
}

// Loads sources with their sign-in tokens. Callers must already have checked
// the caller may act on these ids.
export async function loadSyncable(ids: string[]): Promise<SyncableSource[]> {
  if (ids.length === 0) return [];
  const { data, error } = await createAdminClient().from("data_sources").select(SYNCABLE_SELECT).in("id", ids);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as SyncableRow[]).map(toSyncable);
}

export async function loadOneSyncable(id: string): Promise<SyncableSource | null> {
  return (await loadSyncable([id]))[0] ?? null;
}

// Integrations whose sign-in can serve several clients. Those that collect a
// per-client value before signing in (a Shopify or WooCommerce store, a Google
// Sheet) are tied to that one value, so each client signs in for itself.
export function isShareable(def: IntegrationDef | undefined): boolean {
  return Boolean(def && !def.connectField && def.listAccounts && def.buildConfig);
}

export type SignInTokens = {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt: string;
};

// Saves a sign-in and attaches it to one client, in place of whatever that
// client used before (a sign-in left with no clients is deleted by the
// database). With `connectionId` it renews that saved sign-in instead of
// creating one, which reconnects every client on it at once.
//
// `supabase` is the caller's client for the data_sources write (RLS-scoped in
// routes, so the client row is still checked as the user); the sign-in itself
// is written with the service role.
export async function saveSignIn(
  supabase: SupabaseClient,
  args: {
    agencyId: string;
    clientId: string;
    def: IntegrationDef;
    tokens: SignInTokens;
    identity: string | null;
    identityProvider?: string;
    config: IntegrationConfig;
    connectionId?: string;
    userId?: string | null;
  }
): Promise<SyncableSource> {
  const admin = createAdminClient();
  const tokenColumns = {
    access_token: encrypt(args.tokens.accessToken),
    refresh_token: args.tokens.refreshToken ? encrypt(args.tokens.refreshToken) : null,
    token_expires_at: args.tokens.expiresAt,
  };
  const signIn = {
    identity_provider: args.identityProvider ?? null,
    display_name: args.identity,
    ...tokenColumns,
    status: "connected",
  };

  let connectionId: string;
  if (args.connectionId) {
    // Renew the saved sign-in, scoped to this agency and type so a forged id
    // can't touch anyone else's.
    const { data, error } = await admin
      .from("connections")
      .update({ ...signIn, token_lock_token: null, token_locked_until: null })
      .eq("id", args.connectionId)
      .eq("agency_id", args.agencyId)
      .eq("type", args.def.id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("That sign-in no longer exists. Please connect again.");
    connectionId = data.id as string;

    // Every other client on it works again; their next sync confirms it.
    await admin
      .from("data_sources")
      .update({ status: "connected", last_sync_error: null })
      .eq("connection_id", connectionId)
      .neq("client_id", args.clientId);
  } else {
    const { data, error } = await admin
      .from("connections")
      .insert({ agency_id: args.agencyId, type: args.def.id, created_by: args.userId ?? null, ...signIn })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    connectionId = data.id as string;
  }

  const config: IntegrationConfig = { ...args.config };
  if (args.identityProvider) config.identity_provider = args.identityProvider;

  const { data: source, error } = await supabase
    .from("data_sources")
    .upsert(
      {
        agency_id: args.agencyId,
        client_id: args.clientId,
        type: args.def.id,
        connection_id: connectionId,
        display_name: args.identity,
        config,
        status: "connected",
        last_sync_error: null,
      },
      { onConflict: "client_id,type" }
    )
    .select("id, agency_id, client_id, type, config, connection_id")
    .single();
  if (error) {
    // Don't leave a fresh sign-in behind with no client on it.
    if (!args.connectionId) await admin.from("connections").delete().eq("id", connectionId);
    throw new Error(error.message);
  }

  return {
    ...(source as Omit<SyncableSource, "connection" | "access_token" | "refresh_token" | "token_expires_at">),
    access_token: null,
    refresh_token: null,
    token_expires_at: null,
    connection: {
      id: connectionId,
      identity_provider: args.identityProvider ?? null,
      ...tokenColumns,
      status: "connected",
    },
  };
}
