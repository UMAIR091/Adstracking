import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getIntegration } from "@/lib/integrations/registry";
import { loadOneSyncable } from "@/lib/integrations/connections";
import { syncDataSource } from "@/lib/sync";
import { revalidateIntegrationHealth } from "@/lib/integrationHealth";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { isLinkToken, linkConnectable, loadConnectLink } from "@/lib/connectLinks";
import type { IntegrationConfig } from "@/lib/integrations/types";

export const runtime = "nodejs";

// On a client connect link, after signing in: the client picks which of the
// accounts their sign-in can see is theirs. Allowed only on a connection the
// client made through a link (its own sign-in), never on one the agency
// connected, so a link can't re-point the agency's own setup.
export async function POST(req: Request) {
  const form = await req.formData();
  const token = String(form.get("token") ?? "");
  const type = String(form.get("type") ?? "");
  const accountId = String(form.get("accountId") ?? "");
  const appBase = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const page = (query: string) =>
    NextResponse.redirect(`${appBase}/connect/${isLinkToken(token) ? token : "invalid"}?${query}`, 303);

  const limited = await rateLimit(`connect-link:${clientIp(req)}`, { limit: 30, windowSeconds: 600 });
  if (!limited.allowed) return page(`error=${encodeURIComponent("Too many attempts. Please wait a few minutes.")}`);

  const admin = createAdminClient();
  const found = await loadConnectLink(admin, token);
  if (!found.ok) return page("");
  const { link } = found;

  const def = getIntegration(type);
  if (!link.types.includes(type) || !linkConnectable(def) || !def.readAccounts) {
    return page(`error=${encodeURIComponent("That platform isn't part of this link.")}`);
  }

  const { data: row } = await admin
    .from("data_sources")
    .select("id, config, connection:connections!data_sources_connection_fkey(client_id)")
    .eq("client_id", link.clientId)
    .eq("type", def.id)
    .maybeSingle();
  const owner = (row as { connection: { client_id: string | null } | { client_id: string | null }[] | null } | null)?.connection;
  const ownerClient = Array.isArray(owner) ? owner[0]?.client_id : owner?.client_id;
  if (!row || ownerClient !== link.clientId) {
    return page(`error=${encodeURIComponent(`Connect ${def.name} first.`)}`);
  }

  const config = (row.config ?? {}) as IntegrationConfig;
  if (!def.readAccounts(config).some((a) => a.id === accountId)) {
    return page(`error=${encodeURIComponent("Please choose one of the listed accounts.")}`);
  }

  const next: IntegrationConfig = { ...config, [def.accountConfigKey]: accountId };
  const { error } = await admin.from("data_sources").update({ config: next, last_sync_error: null }).eq("id", row.id);
  if (error) return page(`error=${encodeURIComponent("Couldn't save that. Please try again.")}`);

  const source = await loadOneSyncable(row.id as string);
  if (source) await syncDataSource(admin, source);
  revalidateIntegrationHealth(link.agencyId);
  return page(`connected=${encodeURIComponent(def.id)}`);
}
