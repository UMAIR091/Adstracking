import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { oauthForType } from "@/lib/integrations/registry";

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
    .select("id, type, access_token, refresh_token")
    .eq("id", dataSourceId)
    .maybeSingle();
  if (!ds) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Best-effort provider revocation. Never blocks disconnect — a provider that's
  // down or a token that's already dead must not trap the user's data here.
  const revoke = oauthForType(ds.type as string | null)?.revoke;
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

  return NextResponse.json({ ok: true });
}
