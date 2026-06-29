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
};

// Returns a valid (decrypted) access token for a data source, refreshing and
// persisting a new one if the current token is expired or about to expire. The
// refresh backend is resolved from the integration registry by the source type
// (Google today; other OAuth providers slot in without changing this code).
export async function getValidAccessToken(
  supabase: SupabaseClient,
  ds: DataSourceRow
): Promise<string> {
  if (!ds.access_token) throw new Error("This connection has no access token. Please reconnect.");

  const expiresAt = ds.token_expires_at ? new Date(ds.token_expires_at).getTime() : 0;
  const stillValid = expiresAt - Date.now() > 60_000; // 1-minute buffer
  if (stillValid) return decrypt(ds.access_token);

  if (!ds.refresh_token) throw new Error("Token expired and no refresh token. Please reconnect.");

  const refresh = oauthForType(ds.type)?.refresh ?? refreshAccessToken;
  const refreshed = await refresh(decrypt(ds.refresh_token));
  const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

  await supabase
    .from("data_sources")
    .update({ access_token: encrypt(refreshed.access_token), token_expires_at: newExpiry })
    .eq("id", ds.id);

  return refreshed.access_token;
}
