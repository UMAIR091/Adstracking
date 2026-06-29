import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { encrypt } from "@/lib/crypto";
import { getIntegration, getOAuthProvider } from "@/lib/integrations/registry";
import { syncDataSource, type SyncableSource } from "@/lib/sync";

export const runtime = "nodejs";

// Generic OAuth callback for any registry integration that authenticates through
// this redirect (all Google sources). Resolves the provider from the `type` in
// the signed state, lists accounts, and stores the connection — no per-source
// branching, so adding a Google source needs no change here.
export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const fail = (msg: string) => NextResponse.redirect(`${origin}/dashboard/clients?google_error=${encodeURIComponent(msg)}`);

  if (!code || !state) return fail("Missing code");

  // Verify CSRF nonce + read the target client and integration type.
  let clientId: string;
  let type: string;
  try {
    const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
    clientId = parsed.clientId;
    type = parsed.type || "gsc";
    const cookieNonce = cookies().get("g_oauth_nonce")?.value;
    if (!cookieNonce || cookieNonce !== parsed.nonce) return fail("Invalid state");
  } catch {
    return fail("Invalid state");
  }

  const def = getIntegration(type);
  const oauth = getOAuthProvider(def?.oauthProviderId);
  if (!def || def.status !== "live" || !oauth || !def.listAccounts || !def.buildConfig) {
    return fail("Unsupported integration");
  }

  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) return NextResponse.redirect(`${origin}/login`);

  const supabase = createClient();
  const { data: client } = await supabase.from("clients").select("id").eq("id", clientId).maybeSingle();
  if (!client) return fail("Client not found");

  try {
    const tokens = await oauth.exchangeCode(code);
    const accessToken = tokens.access_token;
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const [identity, accounts] = await Promise.all([oauth.identity(accessToken), def.listAccounts(accessToken)]);
    const config = def.buildConfig(accounts);

    // Replace any existing source of the same type for this client.
    await supabase.from("data_sources").delete().eq("client_id", clientId).eq("type", def.id);

    const { data: inserted, error } = await supabase
      .from("data_sources")
      .insert({
        agency_id: agency.id,
        client_id: clientId,
        type: def.id,
        display_name: identity,
        config,
        access_token: encrypt(accessToken),
        refresh_token: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
        token_expires_at: expiresAt,
        status: "connected",
      })
      .select("id, agency_id, type, config, access_token, refresh_token, token_expires_at")
      .single();
    if (error) return fail(error.message);

    // If exactly one account is known, sync now so analytics are ready on landing.
    if (def.readSelected?.(config)) {
      await syncDataSource(supabase, inserted as SyncableSource);
    }

    cookies().set("g_oauth_nonce", "", { maxAge: 0, path: "/" });
    return NextResponse.redirect(`${origin}/dashboard/clients/${clientId}?connected=${def.id}`);
  } catch (err) {
    return fail((err as Error).message);
  }
}
