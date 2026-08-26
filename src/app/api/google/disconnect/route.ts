import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { oauthForType } from "@/lib/integrations/registry";
import type { GrantOwner } from "@/lib/integrations/types";
import { revalidateIntegrationHealth } from "@/lib/integrationHealth";

export const runtime = "nodejs";

// Disconnects any integration: best-effort revoke the grant at the provider,
// then delete the row (tokens + cached snapshots cascade). Generic + RLS-scoped
// despite the /api/google path. Tokens are read server-side only and never
// returned to the client.
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const { dataSourceId } = body ?? {};
  if (!dataSourceId) return NextResponse.json({ error: "dataSourceId required" }, { status: 400 });

  // RLS scopes this to the caller's own sources. Read the tokens here (server
  // side) so we can revoke; they never leave this route.
  const { data: ds } = await supabase
    .from("data_sources")
    .select("id, type, agency_id, access_token, refresh_token, display_name, config")
    .eq("id", dataSourceId)
    .maybeSingle();
  if (!ds) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const provider = oauthForType(ds.type as string | null);

  // Does another connection sit on the same provider-side grant?
  //
  // Google issues ONE grant per (OAuth client, Google account) and revoking is
  // grant-wide, so revoking here would also kill that account's other Google
  // connections — Search Console, GA4, Google Ads, Business Profile, Sheets,
  // BigQuery, YouTube, and a Google-signed-in Microsoft Ads. Disconnecting one
  // integration must not silently break the rest, so the grant is revoked only
  // when this is the last connection on it. The row is deleted either way.
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

  // Best-effort provider revocation. Never blocks disconnect — a provider that's
  // down or a token that's already dead must not trap the user's data here.
  const revoke = sharesGrant ? undefined : provider?.revoke;
  if (revoke) {
    try {
      await revoke({
        accessToken: ds.access_token ? decrypt(ds.access_token as string) : null,
        refreshToken: ds.refresh_token ? decrypt(ds.refresh_token as string) : null,
      });
    } catch {
      // Swallow — deletion below still removes our stored copy of the grant.
    }
  }

  const { error } = await supabase.from("data_sources").delete().eq("id", dataSourceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (ds.agency_id) revalidateIntegrationHealth(ds.agency_id as string);
  return NextResponse.json({ ok: true });
}
