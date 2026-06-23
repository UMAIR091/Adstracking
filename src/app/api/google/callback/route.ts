import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { encrypt } from "@/lib/crypto";
import { exchangeCode, getGoogleEmail, listGscSites } from "@/lib/google";
import { syncDataSource, type SyncableSource } from "@/lib/sync";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const fail = (msg: string) => NextResponse.redirect(`${origin}/dashboard/clients?google_error=${encodeURIComponent(msg)}`);

  if (!code || !state) return fail("Missing code");

  // Verify CSRF nonce.
  let clientId: string;
  try {
    const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
    clientId = parsed.clientId;
    const cookieNonce = cookies().get("g_oauth_nonce")?.value;
    if (!cookieNonce || cookieNonce !== parsed.nonce) return fail("Invalid state");
  } catch {
    return fail("Invalid state");
  }

  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) return NextResponse.redirect(`${origin}/login`);

  const supabase = createClient();
  const { data: client } = await supabase.from("clients").select("id").eq("id", clientId).maybeSingle();
  if (!client) return fail("Client not found");

  try {
    const tokens = await exchangeCode(code);
    const accessToken = tokens.access_token;
    const [email, sites] = await Promise.all([getGoogleEmail(accessToken), listGscSites(accessToken)]);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    // Replace any existing GSC source for this client.
    await supabase.from("data_sources").delete().eq("client_id", clientId).eq("type", "gsc");

    const { data: inserted, error } = await supabase
      .from("data_sources")
      .insert({
        agency_id: agency.id,
        client_id: clientId,
        type: "gsc",
        display_name: email,
        config: { sites, site_url: sites.length === 1 ? sites[0] : null },
        access_token: encrypt(accessToken),
        refresh_token: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
        token_expires_at: expiresAt,
        status: "connected",
      })
      .select("id, agency_id, config, access_token, refresh_token, token_expires_at")
      .single();
    if (error) return fail(error.message);

    // If there's exactly one property we already know it — sync now so analytics
    // are ready the moment the user lands on the client page.
    if (inserted?.config && (inserted.config as { site_url?: string }).site_url) {
      await syncDataSource(supabase, inserted as SyncableSource);
    }

    cookies().set("g_oauth_nonce", "", { maxAge: 0, path: "/" });
    return NextResponse.redirect(`${origin}/dashboard/clients/${clientId}?connected=gsc`);
  } catch (err) {
    return fail((err as Error).message);
  }
}
