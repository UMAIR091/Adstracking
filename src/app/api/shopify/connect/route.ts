import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getIntegration } from "@/lib/integrations/registry";
import { checkIntegrationLimit } from "@/lib/billing/limits";
import { normalizeShopDomain, shopifyAuthUrl, shopifyConfigured } from "@/lib/integrations/oauth/shopify";

export const runtime = "nodejs";

// Starts the Shopify OAuth flow (?clientId=&shop=). Shopify authorization is
// per-shop, so this route (not the generic handleConnect) builds the state
// with the shop domain and redirects to the store's own authorize page.
export async function GET(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });

  const def = getIntegration("shopify");
  if (!def || def.status !== "live" || !shopifyConfigured()) {
    return NextResponse.json({ error: "Shopify isn't configured yet. Set SHOPIFY_API_KEY and SHOPIFY_API_SECRET." }, { status: 400 });
  }

  const shop = normalizeShopDomain(url.searchParams.get("shop") ?? "");
  if (!shop) {
    // Sent here without a valid shop — back to the consent screen to enter one.
    return NextResponse.redirect(new URL(`/dashboard/connect/shopify?clientId=${clientId}`, req.url));
  }

  const { data: client } = await supabase.from("clients").select("id, agency_id").eq("id", clientId).maybeSingle();
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const _lim = await checkIntegrationLimit(supabase, client.agency_id as string, clientId);
  if (!_lim.allowed) {
    const _base = process.env.NEXT_PUBLIC_APP_URL ?? url.origin;
    return NextResponse.redirect(`${_base}/dashboard/clients/${clientId}?connect_error=${encodeURIComponent(_lim.reason ?? "Integration limit reached.")}`);
  }

  const nonce = crypto.randomUUID();
  const state = Buffer.from(JSON.stringify({ clientId, nonce, type: "shopify", shop })).toString("base64url");
  cookies().set("oauth_nonce", nonce, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/" });

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin}/api/shopify/callback`;
  return NextResponse.redirect(shopifyAuthUrl(shop, state, redirectUri));
}
