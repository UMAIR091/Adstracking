import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt, encrypt } from "@/lib/crypto";
import { refreshAccessToken } from "@/lib/google";
import { oauthForType } from "@/lib/integrations/registry";

type DataSourceRow = {
  id: string;
  type?: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  // Carries per-connection settings such as identity_provider, used to route
  // refresh for integrations with more than one identity provider. Optional so
  // callers that only load token columns still type-check.
  config?: Record<string, unknown> | null;
};

// The identity provider stored on a connection at connect time, if any.
function connectionProvider(row: { config?: Record<string, unknown> | null } | null | undefined): string | undefined {
  const p = row?.config?.identity_provider;
  return typeof p === "string" ? p : undefined;
}

const EXPIRY_BUFFER_MS = 60_000; // treat as expired 1 minute early
const LOCK_TTL_MS = 90_000; // lease long enough to cover a refresh HTTP round-trip
const MAX_WAIT_MS = 25_000; // cap total wait for another worker's refresh (< route maxDuration)

function tokenStillValid(expiresAt: string | null): boolean {
  const ms = expiresAt ? new Date(expiresAt).getTime() : 0;
  return ms - Date.now() > EXPIRY_BUFFER_MS;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Re-reads just the token columns for a source (fresh view under the lock / while
// waiting on another worker). Tokens stay server-side — never returned to callers.
async function readTokens(supabase: SupabaseClient, id: string): Promise<DataSourceRow | null> {
  const { data } = await supabase
    .from("data_sources")
    .select("id, type, access_token, refresh_token, token_expires_at, config")
    .eq("id", id)
    .maybeSingle();
  return (data as DataSourceRow) ?? null;
}

// Atomically claims the refresh lease for this source, or reclaims an expired
// one. Returns true only if THIS caller now holds the lease. The condition
// "lock is free or its lease has expired" makes stuck locks self-healing: a
// crashed holder's lease simply times out and the next caller reclaims it.
async function tryAcquireLock(supabase: SupabaseClient, id: string, lockId: string): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const untilIso = new Date(Date.now() + LOCK_TTL_MS).toISOString();
  const { data } = await supabase
    .from("data_sources")
    .update({ token_lock_token: lockId, token_locked_until: untilIso })
    .eq("id", id)
    .or(`token_locked_until.is.null,token_locked_until.lt.${nowIso}`)
    .select("id")
    .maybeSingle();
  return Boolean(data);
}

// Releases the lease only if we still hold it (safe against a lease that was
// already reclaimed by another worker).
async function releaseLock(supabase: SupabaseClient, id: string, lockId: string): Promise<void> {
  await supabase
    .from("data_sources")
    .update({ token_lock_token: null, token_locked_until: null })
    .eq("id", id)
    .eq("token_lock_token", lockId);
}

// Returns a valid (decrypted) access token for a data source, refreshing and
// persisting a new one if the current token is expired or about to expire.
//
// Refresh is single-flight: a short-lived DB lease ensures the cron and a manual
// "Refresh now" can't refresh the same source's token at the same time (which,
// for providers with rotating refresh tokens, would invalidate one of them). The
// loser of the race waits for the winner's fresh token instead of refreshing
// again. The refresh backend is resolved from the integration registry by source
// type (Google today; other OAuth providers slot in without changing this code).
export async function getValidAccessToken(
  supabase: SupabaseClient,
  ds: DataSourceRow
): Promise<string> {
  if (!ds.access_token) throw new Error("This connection has no access token. Please reconnect.");
  if (tokenStillValid(ds.token_expires_at)) return decrypt(ds.access_token);
  if (!ds.refresh_token) throw new Error("Token expired and no refresh token. Please reconnect.");

  const lockId = crypto.randomUUID();
  const deadline = Date.now() + MAX_WAIT_MS;

  while (true) {
    if (await tryAcquireLock(supabase, ds.id, lockId)) {
      try {
        // Re-check under the lock: another worker may have refreshed while we
        // were queued, in which case we must NOT refresh again.
        const fresh = (await readTokens(supabase, ds.id)) ?? ds;
        if (fresh.access_token && tokenStillValid(fresh.token_expires_at)) {
          await releaseLock(supabase, ds.id, lockId);
          return decrypt(fresh.access_token);
        }

        const refreshToken = fresh.refresh_token ?? ds.refresh_token;
        if (!refreshToken) throw new Error("Token expired and no refresh token. Please reconnect.");

        // Route refresh to the provider that authenticated THIS connection
        // (e.g. Microsoft Ads may be Microsoft- or Google-authenticated). Read
        // from the fresh row under the lock, falling back to the passed row.
        const provider = connectionProvider(fresh) ?? connectionProvider(ds);
        const oauthRefresh = oauthForType(ds.type)?.refresh;
        const refreshed = oauthRefresh
          ? await oauthRefresh(decrypt(refreshToken), { provider })
          : await refreshAccessToken(decrypt(refreshToken));
        const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

        // Persist the new token(s) AND release the lease in one write. For
        // providers that rotate the long-lived token on refresh (e.g. Meta),
        // store the new refresh token too.
        const update: Record<string, string | null> = {
          access_token: encrypt(refreshed.access_token),
          token_expires_at: newExpiry,
          token_lock_token: null,
          token_locked_until: null,
        };
        if (refreshed.refresh_token) update.refresh_token = encrypt(refreshed.refresh_token);
        await supabase.from("data_sources").update(update).eq("id", ds.id);

        return refreshed.access_token;
      } catch (err) {
        // Refresh failed — release the lease but leave the stored tokens intact
        // so a later attempt can retry. Classification (reauth vs transient) is
        // handled by the caller (syncDataSource).
        await releaseLock(supabase, ds.id, lockId);
        throw err;
      }
    }

    // Someone else holds the lease. Wait for their refreshed token instead of
    // piling on a second refresh.
    if (Date.now() > deadline) {
      throw new Error("Token refresh is temporarily busy; please try again in a moment.");
    }
    await sleep(300 + Math.floor(Math.random() * 400)); // jittered backoff
    const latest = await readTokens(supabase, ds.id);
    if (latest?.access_token && tokenStillValid(latest.token_expires_at)) {
      return decrypt(latest.access_token);
    }
  }
}
