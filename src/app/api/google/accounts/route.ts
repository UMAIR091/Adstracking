import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/googleTokens";
import { syncDataSource, type SyncableSource } from "@/lib/sync";
import { getIntegration } from "@/lib/integrations/registry";
import type { IntegrationAccount, IntegrationConfig } from "@/lib/integrations/types";

export const runtime = "nodejs";

// "Refresh now" on a connection that has no account chosen: asks the provider
// for the account list again. The list was otherwise fetched only once, at
// connect time, so an account created or shared after connecting (a Google Ads
// account added under a manager, an Instagram account linked to a Page later)
// never appeared without disconnecting and reconnecting. An account already
// chosen stays chosen. RLS scopes the lookup to the user's own data sources.
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const dataSourceId: string | undefined = body?.dataSourceId;
  if (!dataSourceId) return NextResponse.json({ error: "dataSourceId required" }, { status: 400 });

  const { data: ds } = await supabase
    .from("data_sources")
    .select("id, agency_id, type, config, access_token, refresh_token, token_expires_at")
    .eq("id", dataSourceId)
    .maybeSingle();
  if (!ds) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const def = getIntegration(ds.type as string);
  if (!def?.listAccounts || !def.buildConfig) {
    return NextResponse.json({ error: "This integration has no account list to refresh" }, { status: 400 });
  }

  const current = (ds.config ?? {}) as IntegrationConfig;
  const provider = typeof current.identity_provider === "string" ? current.identity_provider : undefined;
  let accounts: IntegrationAccount[];
  try {
    const accessToken = await getValidAccessToken(supabase, ds as SyncableSource);
    accounts = await def.listAccounts(accessToken, { provider });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }

  const config: IntegrationConfig = { ...current, ...def.buildConfig(accounts) };
  const chosen = def.readSelected?.(current) ?? null;
  if (chosen) config[def.accountConfigKey] = chosen;

  const { error } = await supabase.from("data_sources").update({ config }).eq("id", dataSourceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // buildConfig picks the account when there is only one, so sync right away,
  // as Save does, rather than leaving the source empty until the next cron run.
  if (def.readSelected?.(config)) await syncDataSource(supabase, { ...(ds as SyncableSource), config });

  return NextResponse.json({ ok: true, accounts: accounts.length });
}
