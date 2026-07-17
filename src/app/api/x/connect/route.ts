import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getIntegration } from "@/lib/integrations/registry";
import { xRequestToken, X_OAUTH_COOKIE } from "@/lib/integrations/oauth/xads";

export const runtime = "nodejs";

// Starts X Ads' OAuth 1.0a flow (?clientId=&type=x_ads). Unlike OAuth 2 providers
// this can't use the generic handleConnect: 1.0a needs a signed server-side
// request_token call first, and the resulting token secret must survive the round
// trip to be able to exchange the verifier. We keep it in an httpOnly cookie
// (never exposed to the page) alongside the target client id, which also doubles
// as the CSRF check on the way back.
export async function GET(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });

  const def = getIntegration("x_ads");
  if (!def || def.status !== "live") {
    return NextResponse.json({ error: "This integration can't be connected yet." }, { status: 400 });
  }

  const { data: client } = await supabase.from("clients").select("id").eq("id", clientId).maybeSingle();
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  try {
    const { token, secret, authorizeUrl } = await xRequestToken();
    cookies().set(X_OAUTH_COOKIE, JSON.stringify({ clientId, token, secret }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });
    return NextResponse.redirect(authorizeUrl);
  } catch (err) {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? url.origin;
    return NextResponse.redirect(`${base}/dashboard/clients/${clientId}?connect_error=${encodeURIComponent((err as Error).message)}`);
  }
}
