import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { encrypt } from "@/lib/crypto";
import { exchangeCode, getGoogleEmail, listGscSites, listGa4Properties } from "@/lib/google";
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
  let type: "gsc" | "ga4" = "gsc";
  try {
    const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
    clientId = parsed.clientId;
    if (parsed.type === "ga4") type = "ga4";
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
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    // Pull the account email plus the right resource list for the connector.
    const [email, config] = await Promise.all([
      getGoogleEmail(accessToken),
      type === "ga4"
        ? listGa4Properties(accessToken).then((properties) => ({
            properties,
            property_id: properties.length === 1 ? properties[0].id : null,
          }))
        : listGscSites(accessToken).then((sites) => ({
            sites,
            site_url: sites.length === 1 ? sites[0] : null,
          })),
    ]);

    // Replace any existing source of the same type for this client.
    await supabase.from("data_sources").delete().eq("client_id", clientId).eq("type", type);

    const { data: inserted, error } = await supabase
      .from("data_sources")
      .insert({
        agency_id: agency.id,
        client_id: clientId,
        type,
        display_name: email,
        config,
        access_token: encrypt(accessToken),
        refresh_token: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
        token_expires_at: expiresAt,
        status: "connected",
      })
      .select("id, agency_id, type, config, access_token, refresh_token, token_expires_at")
      .single();
    if (error) return fail(error.message);

    // If exactly one property is known, sync now so analytics are ready the
    // moment the user lands on the client page.
    const cfg = (inserted?.config ?? {}) as { site_url?: string | null; property_id?: string | null };
    if (cfg.site_url || cfg.property_id) {
      await syncDataSource(supabase, inserted as SyncableSource);
    }

    cookies().set("g_oauth_nonce", "", { maxAge: 0, path: "/" });
    return NextResponse.redirect(`${origin}/dashboard/clients/${clientId}?connected=${type}`);
  } catch (err) {
    return fail((err as Error).message);
  }
}
