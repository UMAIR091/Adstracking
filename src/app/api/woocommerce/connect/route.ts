import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getIntegration } from "@/lib/integrations/registry";
import { checkIntegrationLimit } from "@/lib/billing/limits";
import { normalizeStoreUrl, wooAuthUrl, signWooState } from "@/lib/integrations/oauth/woocommerce";

export const runtime = "nodejs";

// Starts the WooCommerce authorization flow (?clientId=&store=). WooCommerce
// authorization is per-store, so this route (not the generic handleConnect)
// carries the store URL through a signed state and redirects to the store's own
// /wc-auth/v1/authorize page. The keys come back on the callback route.
export async function GET(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });

  const def = getIntegration("woocommerce");
  if (!def || def.status !== "live") {
    return NextResponse.json({ error: "WooCommerce can't be connected yet." }, { status: 400 });
  }

  const storeUrl = normalizeStoreUrl(url.searchParams.get("store") ?? "");
  if (!storeUrl) {
    // Sent here without a valid store URL — back to the consent screen to enter one.
    return NextResponse.redirect(new URL(`/dashboard/connect/woocommerce?clientId=${clientId}`, req.url));
  }

  const { data: client } = await supabase.from("clients").select("id, agency_id").eq("id", clientId).maybeSingle();
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const _lim = await checkIntegrationLimit(supabase, client.agency_id as string, clientId);
  if (!_lim.allowed) {
    const _base = process.env.NEXT_PUBLIC_APP_URL ?? url.origin;
    return NextResponse.redirect(`${_base}/dashboard/clients/${clientId}?connect_error=${encodeURIComponent(_lim.reason ?? "Integration limit reached.")}`);
  }

  const state = signWooState({ clientId, storeUrl, nonce: crypto.randomUUID() });
  const base = process.env.NEXT_PUBLIC_APP_URL ?? url.origin;
  const returnUrl = `${base}/api/woocommerce/return?state=${state}`;
  const callbackUrl = `${base}/api/woocommerce/callback`;

  return NextResponse.redirect(wooAuthUrl(storeUrl, state, returnUrl, callbackUrl));
}
