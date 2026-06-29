import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getIntegration, getOAuthProvider } from "@/lib/integrations/registry";

export const runtime = "nodejs";

// Starts the OAuth flow for a registry integration that authenticates through
// Google. The `type` is validated against the registry, so unknown or not-yet-
// available sources are rejected.
export async function GET(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });

  const type = url.searchParams.get("type") || "gsc";
  const def = getIntegration(type);
  const oauth = getOAuthProvider(def?.oauthProviderId);
  if (!def || def.status !== "live" || def.oauthProviderId !== "google" || !oauth) {
    return NextResponse.json({ error: "This integration can't be connected yet." }, { status: 400 });
  }

  // Confirm the client belongs to this user (RLS).
  const { data: client } = await supabase.from("clients").select("id").eq("id", clientId).maybeSingle();
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const nonce = crypto.randomUUID();
  const state = Buffer.from(JSON.stringify({ clientId, nonce, type: def.id })).toString("base64url");

  // CSRF: stash the nonce in an httpOnly cookie to verify on callback.
  cookies().set("g_oauth_nonce", nonce, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/" });

  return NextResponse.redirect(oauth.authUrl(state));
}
