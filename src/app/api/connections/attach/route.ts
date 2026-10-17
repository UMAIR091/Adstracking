import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { getIntegration, isLive } from "@/lib/integrations/registry";
import { isShareable, type ConnectionTokens } from "@/lib/integrations/connections";
import { getValidAccessToken } from "@/lib/googleTokens";
import { syncDataSource, type SyncableSource } from "@/lib/sync";
import { checkIntegrationLimit } from "@/lib/billing/limits";
import { revalidateIntegrationHealth } from "@/lib/integrationHealth";
import { logError } from "@/lib/errorLog";
import { publicMessage } from "@/lib/errors";
import { CONNECT_FLASH_COOKIE, CONNECT_FLASH_MAX_AGE, encodeConnectFlash } from "@/lib/integrations/connectFlash";
import type { IntegrationConfig } from "@/lib/integrations/types";

export const runtime = "nodejs";

// "Use an existing sign-in" on the consent screen: points a client at one of
// the agency's saved sign-ins (migration 0046) without another trip through
// the provider. The account list is read live with that sign-in, so client
// accounts shared with the agency since it signed in show up too.
export async function POST(req: Request) {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const clientId = String(form.get("clientId") ?? "");
  const connectionId = String(form.get("connectionId") ?? "");
  const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const fail = (msg: string) =>
    NextResponse.redirect(
      `${base}/dashboard/${clientId ? `clients/${clientId}` : "clients"}?connect_error=${encodeURIComponent(msg)}`,
      303
    );
  if (!clientId || !connectionId) return fail("Choose a sign-in to use.");

  // Both reads are RLS-scoped: the client and the sign-in must be in the
  // caller's own workspace.
  const supabase = createClient();
  const [{ data: client }, { data: conn }] = await Promise.all([
    supabase.from("clients").select("id, agency_id").eq("id", clientId).maybeSingle(),
    supabase.from("connections").select("id, agency_id, type, display_name, identity_provider, status").eq("id", connectionId).maybeSingle(),
  ]);
  if (!client) return fail("Client not found");
  if (!conn || conn.agency_id !== client.agency_id) return fail("That sign-in isn't available.");
  if (conn.status === "revoked") return fail("That sign-in has expired. Reconnect it, or sign in with another account.");

  const def = getIntegration(conn.type as string);
  if (!def || !isLive(def.id) || !isShareable(def)) return fail("That sign-in can't be shared.");

  // A client already on this integration is switching sign-ins, not adding one.
  const { data: existing } = await supabase
    .from("data_sources")
    .select("id")
    .eq("client_id", clientId)
    .eq("type", def.id)
    .maybeSingle();
  if (!existing) {
    const limit = await checkIntegrationLimit(supabase, client.agency_id as string, clientId);
    if (!limit.allowed) return fail(limit.reason ?? "Integration limit reached.");
  }

  try {
    // Tokens are service-role only; the RLS read above authorized this id.
    const { data: tokens } = await createAdminClient()
      .from("connections")
      .select("id, identity_provider, access_token, refresh_token, token_expires_at, status")
      .eq("id", conn.id)
      .single();
    const connection = tokens as ConnectionTokens;
    const provider = connection.identity_provider ?? undefined;

    const accessToken = await getValidAccessToken(supabase, {
      id: existing?.id ?? conn.id,
      type: def.id,
      config: { identity_provider: provider },
      access_token: null,
      refresh_token: null,
      token_expires_at: null,
      connection,
    });
    const accounts = await def.listAccounts!(accessToken, { provider });
    const config: IntegrationConfig = def.buildConfig!(accounts);
    if (provider) config.identity_provider = provider;

    const { data: source, error } = await supabase
      .from("data_sources")
      .upsert(
        {
          agency_id: client.agency_id,
          client_id: clientId,
          type: def.id,
          connection_id: conn.id,
          display_name: conn.display_name,
          config,
          status: "connected",
          last_sync_error: null,
        },
        { onConflict: "client_id,type" }
      )
      .select("id, agency_id, client_id, type, config, connection_id")
      .single();
    if (error) throw new Error(error.message);

    const selected = def.readSelected?.(config) ?? null;
    if (selected) {
      await syncDataSource(supabase, {
        ...(source as Omit<SyncableSource, "connection" | "access_token" | "refresh_token" | "token_expires_at">),
        access_token: null,
        refresh_token: null,
        token_expires_at: null,
        connection,
      });
    }
    revalidateIntegrationHealth(client.agency_id as string);

    const res = NextResponse.redirect(`${base}/dashboard/clients/${clientId}/data-sources?connected=${def.id}`, 303);
    res.cookies.set(
      CONNECT_FLASH_COOKIE,
      encodeConnectFlash({
        account: selected ? (accounts.find((a) => a.id === selected)?.name ?? null) : null,
        identity: (conn.display_name as string | null) ?? null,
      }),
      { maxAge: CONNECT_FLASH_MAX_AGE, path: "/dashboard", sameSite: "lax", secure: base.startsWith("https://") }
    );
    return res;
  } catch (err) {
    await logError({ context: "api_route", agencyId: agency.id, provider: def.id, message: (err as Error).message });
    return fail(publicMessage(err, `Couldn't use that ${def.name} sign-in. Please try again or sign in again.`, { provider: def.id }));
  }
}
