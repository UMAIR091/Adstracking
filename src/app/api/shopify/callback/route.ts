import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { encrypt } from "@/lib/crypto";
import { syncDataSource, type SyncableSource } from "@/lib/sync";
import {
  exchangeShopifyCode, getShopName, normalizeShopDomain, verifyShopifyHmac,
} from "@/lib/integrations/oauth/shopify";

export const runtime = "nodejs";

const NONCE_COOKIE = "oauth_nonce";

// Shopify OAuth redirect target. Mirrors the generic handleCallback but
// verifies Shopify's HMAC signature and carries the shop domain from state
// (the token exchange happens against the shop's own domain).
export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const fail = (msg: string) => {
    cookies().set(NONCE_COOKIE, "", { maxAge: 0, path: "/" });
    return NextResponse.redirect(`${origin}/dashboard/clients?connect_error=${encodeURIComponent(msg)}`);
  };

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  if (!code || !state) return fail("Missing authorization code");
  if (!verifyShopifyHmac(searchParams)) return fail("Invalid Shopify signature");

  let clientId: string;
  let shop: string;
  try {
    const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
    clientId = parsed.clientId;
    shop = parsed.shop;
    const cookieNonce = cookies().get(NONCE_COOKIE)?.value;
    if (!cookieNonce || cookieNonce !== parsed.nonce) return fail("Invalid state");
  } catch {
    return fail("Invalid state");
  }
  // The shop echoing back must match the one authorized in state.
  const echoedShop = normalizeShopDomain(searchParams.get("shop") ?? "");
  if (!shop || echoedShop !== shop) return fail("Shop mismatch");

  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) return NextResponse.redirect(`${origin}/login`);

  const supabase = createClient();
  const { data: client } = await supabase.from("clients").select("id").eq("id", clientId).maybeSingle();
  if (!client) return fail("Client not found");

  try {
    const tokens = await exchangeShopifyCode(shop, code);
    const displayName = await getShopName(shop, tokens.access_token);
    const config = { accounts: [{ id: shop, name: displayName }], account_id: shop };

    // Replace any existing Shopify source for this client (same as the generic flow).
    await supabase.from("data_sources").delete().eq("client_id", clientId).eq("type", "shopify");
    const { data: inserted, error } = await supabase
      .from("data_sources")
      .insert({
        agency_id: agency.id,
        client_id: clientId,
        type: "shopify",
        display_name: displayName,
        config,
        access_token: encrypt(tokens.access_token),
        refresh_token: null, // offline tokens don't rotate — revocation = reconnect
        token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        status: "connected",
      })
      .select("id, agency_id, type, config, access_token, refresh_token, token_expires_at")
      .single();
    if (error) throw new Error(error.message);

    await syncDataSource(supabase, inserted as SyncableSource);
    cookies().set(NONCE_COOKIE, "", { maxAge: 0, path: "/" });
    return NextResponse.redirect(`${origin}/dashboard/clients/${clientId}?connected=shopify`);
  } catch (err) {
    return fail((err as Error).message);
  }
}
