// Generic OAuth connect + callback, shared by every integration route (Google,
// Meta, and future providers). Routes are thin wrappers that delegate here, so
// the flow lives in one place and adding a provider needs no new flow code.
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { encrypt } from "@/lib/crypto";
import { syncDataSource, type SyncableSource } from "@/lib/sync";
import { getIntegration, getOAuthProvider } from "./registry";
import { classifyIntegrationError } from "./errors";
import { logError } from "@/lib/errorLog";
import type { IntegrationConfig, IntegrationDef, OAuthProvider } from "./types";

const NONCE_COOKIE = "oauth_nonce";

// Starts an OAuth flow for `?clientId=&type=`. Validates the target integration
// is live and has a registered OAuth backend, sets a CSRF nonce, and redirects
// to the provider's consent screen.
export async function handleConnect(req: Request): Promise<Response> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });

  // Require an explicit integration type — never silently default to GSC, or a
  // caller with a missing/typo'd type would connect the wrong provider.
  const type = url.searchParams.get("type");
  if (!type) return NextResponse.json({ error: "type required" }, { status: 400 });
  const def = getIntegration(type);
  const oauth = getOAuthProvider(def?.oauthProviderId);
  if (!def || def.status !== "live" || !oauth) {
    return NextResponse.json({ error: "This integration can't be connected yet." }, { status: 400 });
  }

  const { data: client } = await supabase.from("clients").select("id").eq("id", clientId).maybeSingle();
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  // Identity-provider selection for integrations that accept more than one (e.g.
  // Microsoft Ads: microsoft | google). Default to the first declared provider;
  // reject an unknown value so a typo can't silently mis-route the sign-in.
  let provider: string | undefined;
  if (def.identityProviders?.length) {
    provider = url.searchParams.get("provider") ?? def.identityProviders[0].id;
    if (!def.identityProviders.some((p) => p.id === provider)) {
      return NextResponse.json({ error: "Unsupported sign-in provider." }, { status: 400 });
    }
  }

  const nonce = crypto.randomUUID();
  const state = Buffer.from(JSON.stringify({ clientId, nonce, type: def.id, provider })).toString("base64url");
  cookies().set(NONCE_COOKIE, nonce, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/" });

  const authorizationUrl = oauth.authUrl(state);
  // Debug: the callback's cookies (session + CSRF nonce) are only sent if the
  // provider redirects back to the SAME host the user is on. Log the request
  // host and the authorize redirect_uri host so a mismatch (e.g. a stale
  // GOOGLE_OAUTH_REDIRECT_URI pointing at *.vercel.app) is visible in logs.
  try {
    const authUrlObj = new URL(authorizationUrl);
    console.log("[oauth-debug] connect", JSON.stringify({
      type: def.id,
      provider: provider ?? null,
      requestHost: url.host,
      authorizeHost: authUrlObj.host,
      redirectUri: authUrlObj.searchParams.get("redirect_uri"),
      state,
    }));
  } catch { /* logging must never break the flow */ }

  return NextResponse.redirect(authorizationUrl);
}

// Handles the provider's redirect back: verifies CSRF state, then completes the
// connection (token exchange, account listing, storage, initial sync).
export async function handleCallback(req: Request): Promise<Response> {
  const { searchParams, origin, host } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  console.log("[oauth-debug] callback:enter", JSON.stringify({
    callbackHost: host, hasCode: Boolean(code), hasState: Boolean(state),
    providerError: searchParams.get("error") ?? null,
  }));
  const fail = (msg: string) => {
    console.log("[oauth-debug] callback:fail", JSON.stringify({ reason: msg, redirectTo: `${origin}/dashboard/clients` }));
    // Single-use nonce: clear on failure too, so a retried/replayed callback
    // can't reuse it, and the next connect attempt starts clean.
    cookies().set(NONCE_COOKIE, "", { maxAge: 0, path: "/" });
    return NextResponse.redirect(`${origin}/dashboard/clients?connect_error=${encodeURIComponent(msg)}`);
  };

  // Providers signal denial via error/error_description instead of a code.
  const providerError = searchParams.get("error_description") || searchParams.get("error");
  if (providerError) return fail(providerError);
  if (!code || !state) return fail("Missing authorization code");

  let clientId: string;
  let type: string;
  let provider: string | undefined;
  try {
    const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
    clientId = parsed.clientId;
    type = parsed.type;
    provider = parsed.provider;
    if (!clientId || !type) return fail("Invalid state");
    const cookieNonce = cookies().get(NONCE_COOKIE)?.value;
    console.log("[oauth-debug] callback:state", JSON.stringify({
      resolvedType: type, provider: provider ?? null, hasClientId: Boolean(clientId),
      nonceCookiePresent: Boolean(cookieNonce), nonceMatches: cookieNonce === parsed.nonce,
    }));
    if (!cookieNonce || cookieNonce !== parsed.nonce) return fail("Invalid state");
  } catch {
    return fail("Invalid state");
  }

  const def = getIntegration(type);
  const oauth = getOAuthProvider(def?.oauthProviderId);
  if (!def || def.status !== "live" || !oauth) return fail("Unsupported integration");

  const { user, agency } = await getCurrentUserAndAgency();
  console.log("[oauth-debug] callback:session", JSON.stringify({
    resolvedType: type, provider: provider ?? null, userPresent: Boolean(user), agencyPresent: Boolean(agency),
  }));
  if (!user || !agency) {
    console.log("[oauth-debug] callback:redirect-login", JSON.stringify({ callbackHost: host, redirectTo: `${origin}/login` }));
    return NextResponse.redirect(`${origin}/login`);
  }

  const supabase = createClient();
  const { data: client } = await supabase.from("clients").select("id").eq("id", clientId).maybeSingle();
  if (!client) return fail("Client not found");

  try {
    await completeOAuthConnect(supabase, agency.id, clientId, def, oauth, code, provider);
    cookies().set(NONCE_COOKIE, "", { maxAge: 0, path: "/" });
    console.log("[oauth-debug] callback:success", JSON.stringify({ type: def.id, provider: provider ?? null, redirectTo: `${origin}/dashboard/clients/${clientId}?connected=${def.id}` }));
    return NextResponse.redirect(`${origin}/dashboard/clients/${clientId}?connected=${def.id}`);
  } catch (err) {
    // Token exchange / account-listing / storage failed — record it, then fail.
    await logError({
      context: "oauth_callback",
      agencyId: agency.id,
      provider: def.id,
      errorType: classifyIntegrationError(err),
      message: (err as Error).message,
    });
    return fail((err as Error).message);
  }
}

// Exchanges the code, lists accounts, stores the encrypted connection, and syncs
// immediately if exactly one account was auto-selected.
export async function completeOAuthConnect(
  supabase: SupabaseClient,
  agencyId: string,
  clientId: string,
  def: IntegrationDef,
  oauth: OAuthProvider,
  code: string,
  provider?: string
): Promise<void> {
  if (!def.listAccounts || !def.buildConfig) throw new Error("Integration is not connectable");

  const tokens = await oauth.exchangeCode(code, { provider });
  const accessToken = tokens.access_token;
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  const [identity, accounts] = await Promise.all([
    oauth.identity(accessToken, { provider }),
    def.listAccounts(accessToken, { provider }),
  ]);
  const config = def.buildConfig(accounts);
  // Record which identity provider authenticated this connection so token
  // refresh (and any provider-specific API headers) can route correctly later.
  if (provider) (config as IntegrationConfig).identity_provider = provider;

  // Replace any existing source of the same type for this client.
  await supabase.from("data_sources").delete().eq("client_id", clientId).eq("type", def.id);

  const { data: inserted, error } = await supabase
    .from("data_sources")
    .insert({
      agency_id: agencyId,
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
  if (error) throw new Error(error.message);

  if (def.readSelected?.(config)) {
    await syncDataSource(supabase, inserted as SyncableSource);
  }
}
