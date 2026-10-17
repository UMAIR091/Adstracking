import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/crypto";
import { oauthForType } from "@/lib/integrations/registry";
import type { GrantOwner, OAuthProvider } from "@/lib/integrations/types";
import { revalidateIntegrationHealth } from "@/lib/integrationHealth";

export const runtime = "nodejs";

type TokenPair = { access_token: string | null; refresh_token: string | null };

// Best-effort provider revocation. Never blocks disconnect — a provider that's
// down or a token that's already dead must not trap the user's data here.
async function revokeQuietly(provider: OAuthProvider | undefined, tokens: TokenPair): Promise<void> {
  if (!provider?.revoke) return;
  try {
    await provider.revoke({
      accessToken: tokens.access_token ? decrypt(tokens.access_token) : null,
      refreshToken: tokens.refresh_token ? decrypt(tokens.refresh_token) : null,
    });
  } catch {
    // Swallow — deletion below still removes our stored copy of the grant.
  }
}

// Disconnects one client's integration and deletes its row (cached snapshots
// cascade). Generic + RLS-scoped despite the /api/google path.
//
// Sign-ins are shared across the agency's clients (migration 0046), so this
// only removes THIS client's use of one. When it was the last client on the
// sign-in, the database deletes the sign-in's tokens along with it and the
// grant is revoked at the provider first. Tokens are read server-side only
// and never returned to the client.
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const { dataSourceId } = body ?? {};
  if (!dataSourceId) return NextResponse.json({ error: "dataSourceId required" }, { status: 400 });

  // RLS scopes this to the caller's own sources.
  const { data: ds } = await supabase
    .from("data_sources")
    .select("id, type, agency_id, connection_id, display_name, config")
    .eq("id", dataSourceId)
    .maybeSingle();
  if (!ds) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const provider = oauthForType(ds.type as string | null);

  // Is this the last client on its sign-in? Only then do the tokens go, and
  // only then is the grant a candidate for revoking.
  let lastOnSignIn = false;
  if (ds.connection_id) {
    const { count } = await supabase
      .from("data_sources")
      .select("id", { count: "exact", head: true })
      .eq("connection_id", ds.connection_id as string)
      .neq("id", dataSourceId);
    lastOnSignIn = !count;
  }

  if (lastOnSignIn) {
    // Does another of the agency's connections sit on the same provider-side
    // grant?
    //
    // Google issues ONE grant per (OAuth client, Google account) and revoking is
    // grant-wide, so revoking here would also kill that account's other Google
    // connections — Search Console, GA4, Google Ads, Business Profile, Sheets,
    // BigQuery, YouTube, and a Google-signed-in Microsoft Ads. Each connection
    // records who signed in (display_name) and how (config.identity_provider),
    // so the agency's other rows answer this whether or not they're linked.
    const grantKey = provider?.grantKey?.(ds as GrantOwner) ?? null;
    let sharesGrant = false;
    if (grantKey) {
      const { data: siblings } = await supabase
        .from("data_sources")
        .select("id, type, display_name, config")
        .eq("agency_id", ds.agency_id as string)
        .neq("id", dataSourceId);
      sharesGrant = (siblings ?? []).some(
        (s) => oauthForType(s.type as string | null)?.grantKey?.(s as GrantOwner) === grantKey
      );
    }

    if (!sharesGrant) {
      // The tokens are the sign-in's, readable only with the service role.
      const { data: conn } = await createAdminClient()
        .from("connections")
        .select("access_token, refresh_token")
        .eq("id", ds.connection_id as string)
        .eq("agency_id", ds.agency_id as string)
        .maybeSingle();
      if (conn) await revokeQuietly(provider, conn as TokenPair);
    }
  }

  // Deleting the row also deletes the sign-in when no other client uses it
  // (trigger trg_data_sources_orphan_connection, migration 0046).
  const { error } = await supabase.from("data_sources").delete().eq("id", dataSourceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (ds.agency_id) revalidateIntegrationHealth(ds.agency_id as string);
  return NextResponse.json({ ok: true });
}
