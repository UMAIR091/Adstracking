import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { encrypt } from "@/lib/crypto";
import { syncDataSource, type SyncableSource } from "@/lib/sync";
import { getIntegration } from "@/lib/integrations/registry";
import { logError } from "@/lib/errorLog";
import { publicMessage } from "@/lib/errors";
import { checkIntegrationLimit } from "@/lib/billing/limits";

export const runtime = "nodejs";

// Generic connect handler for API-key integrations (Klaviyo, CallRail, Ahrefs,
// Semrush …). The consent screen POSTs the secret field(s) here so they never
// appear in a URL/history. We verify them via the provider's verifyApiKey, then
// store the connection through the same pipeline the OAuth flow uses.
export async function POST(req: Request) {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const clientId = String(form.get("clientId") ?? "");
  const type = String(form.get("type") ?? "");
  const origin = new URL(req.url).origin;
  const base = process.env.NEXT_PUBLIC_APP_URL ?? origin;
  const fail = (msg: string, cid = clientId) =>
    NextResponse.redirect(`${base}/dashboard/${cid ? `clients/${cid}` : "clients"}?connect_error=${encodeURIComponent(msg)}`);

  const def = getIntegration(type);
  if (!def || def.status !== "live" || def.authKind !== "apikey" || !def.verifyApiKey || !def.buildConfig) {
    return fail("This integration can't be connected this way.");
  }
  if (!clientId) return fail("Missing client");

  const supabase = createClient();
  const { data: client } = await supabase.from("clients").select("id, agency_id").eq("id", clientId).maybeSingle();
  if (!client) return fail("Client not found");

  // Enforce the plan's per-client integration limit (trial only; paid = unlimited).
  const limit = await checkIntegrationLimit(supabase, client.agency_id as string, clientId);
  if (!limit.allowed) return fail(limit.reason ?? "Integration limit reached.");

  // Collect only the declared fields (trimmed).
  const fields: Record<string, string> = {};
  for (const f of def.connectFields ?? []) fields[f.name] = String(form.get(f.name) ?? "").trim();

  try {
    const { displayName, token, accounts } = await def.verifyApiKey(fields);
    const config = def.buildConfig(accounts);

    // Atomic reconnect via UPSERT on (client_id, type) — see migration 0023.
    const { data: inserted, error } = await supabase
      .from("data_sources")
      .upsert(
        {
          agency_id: agency.id,
          client_id: clientId,
          type: def.id,
          display_name: displayName,
          config,
          access_token: encrypt(token),
          refresh_token: null, // api keys don't rotate — revocation = reconnect
          token_expires_at: new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString(),
          status: "connected",
        },
        { onConflict: "client_id,type" }
      )
      .select("id, agency_id, type, config, access_token, refresh_token, token_expires_at")
      .single();
    if (error) throw new Error(error.message);

    if (def.readSelected?.(config)) await syncDataSource(supabase, inserted as SyncableSource);
    return NextResponse.redirect(`${base}/dashboard/clients/${clientId}?connected=${def.id}`);
  } catch (err) {
    // Invalid key, provider verification failure, or storage error. Log the raw
    // detail; show the user a safe message (an invalid-key message is surfaced
    // verbatim by publicMessage's allowlist; internals are masked).
    await logError({ context: "api_route", agencyId: agency.id, provider: def.id, message: (err as Error).message });
    return fail(publicMessage(err, `Couldn't connect ${def.name}. Check your details and try again.`, { provider: def.id }));
  }
}
