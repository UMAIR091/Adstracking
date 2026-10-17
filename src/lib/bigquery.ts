// Server-side helper shared by the /api/bigquery/* routes. Loads a BigQuery
// connection scoped to the caller (RLS enforces tenant isolation), then resolves
// a valid Google access token through the shared refresh+locking machinery
// (getValidAccessToken). Tokens are handled here on the server only and are
// never returned to the client.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/googleTokens";
import { loadOneSyncable } from "@/lib/integrations/connections";
import type { SyncableSource } from "@/lib/sync";

export type BigQueryConnection = SyncableSource & { type: string };

export type BigQueryContext =
  | { ok: true; supabase: SupabaseClient; ds: BigQueryConnection; accessToken: string }
  | { ok: false; status: number; error: string };

export async function bigQueryContext(dataSourceId: string | null | undefined): Promise<BigQueryContext> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Unauthorized" };
  if (!dataSourceId) return { ok: false, status: 400, error: "dataSourceId required" };

  // RLS scopes this select to the caller's own agency — a user can never load
  // another tenant's connection. The sign-in's tokens are then loaded with the
  // service role, which tenants can't read directly.
  const { data: visible } = await supabase.from("data_sources").select("id").eq("id", dataSourceId).maybeSingle();
  const ds = (visible ? await loadOneSyncable(dataSourceId) : null) as BigQueryConnection | null;
  if (!ds) return { ok: false, status: 404, error: "Not found" };
  if (ds.type !== "bigquery") return { ok: false, status: 400, error: "Not a BigQuery connection" };

  try {
    const accessToken = await getValidAccessToken(supabase, ds);
    return { ok: true, supabase, ds, accessToken };
  } catch (err) {
    // Expired/revoked grant with no usable refresh token, etc.
    return { ok: false, status: 400, error: (err as Error).message };
  }
}
