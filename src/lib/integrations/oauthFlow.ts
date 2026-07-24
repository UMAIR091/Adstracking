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
import { publicMessage } from "@/lib/errors";
import { checkIntegrationLimit } from "@/lib/billing/limits";
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

  const { data: client } = await supabase.from("clients").select("id, agency_id").eq("id", clientId).maybeSingle();
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  // Enforce the plan's per-client integration limit (trial only; paid = unlimited).
  const limit = await checkIntegrationLimit(supabase, client.agency_id as string, clientId);
  if (!limit.allowed) {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? url.origin;
    return NextResponse.redirect(`${base}/dashboard/clients/${clientId}?connect_error=${encodeURIComponent(limit.reason ?? "Integration limit reached.")}`);
  }

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
  return NextResponse.redirect(authorizationUrl);
}

// Handles the provider's redirect back: verifies CSRF state, then completes the
// connection (token exchange, account listing, storage, initial sync).
export async function handleCallback(req: Request): Promise<Response> {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const fail = (msg: string) => {
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
    if (!cookieNonce || cookieNonce !== parsed.nonce) return fail("Invalid state");
  } catch {
    return fail("Invalid state");
  }

  const def = getIntegration(type);
  const oauth = getOAuthProvider(def?.oauthProviderId);
  if (!def || def.status !== "live" || !oauth) return fail("Unsupported integration");

  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) return NextResponse.redirect(`${origin}/login`);

  const supabase = createClient();
  const { data: client } = await supabase.from("clients").select("id").eq("id", clientId).maybeSingle();
  if (!client) return fail("Client not found");

  try {
    await completeOAuthConnect(supabase, agency.id, clientId, def, oauth, code, provider);
    cookies().set(NONCE_COOKIE, "", { maxAge: 0, path: "/" });
    return NextResponse.redirect(`${origin}/dashboard/clients/${clientId}?connected=${def.id}`);
  } catch (err) {
    // Token exchange / account-listing / storage failed — record it, then fail
    // with a user-safe message (raw provider/DB detail stays in the logs).
    await logError({
      context: "oauth_callback",
      agencyId: agency.id,
      provider: def.id,
      errorType: classifyIntegrationError(err),
      message: (err as Error).message,
    });
    return fail(publicMessage(err, `Couldn't connect ${def.name}. Please try again.`, { provider: def.id }));
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

  // Atomic reconnect: a single UPSERT keyed on (client_id, type) replaces any
  // existing source of the same type in one statement (migration 0023). This
  // removes the old delete-then-insert window where a crash between the two
  // left the client with no source, and updates the row in place so historical
  // snapshots stay linked instead of being cascade-deleted.
  const { data: inserted, error } = await supabase
    .from("data_sources")
    .upsert(
      {
        agency_id: agencyId,
        client_id: clientId,
        type: def.id,
        display_name: identity,
        config,
        access_token: encrypt(accessToken),
        refresh_token: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
        token_expires_at: expiresAt,
        status: "connected",
      },
      { onConflict: "client_id,type" }
    )
    .select("id, agency_id, type, config, access_token, refresh_token, token_expires_at")
    .single();
  if (error) throw new Error(error.message);

  if (def.readSelected?.(config)) {
    await syncDataSource(supabase, inserted as SyncableSource);
  }
}
