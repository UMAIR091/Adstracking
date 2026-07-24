import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encrypt } from "@/lib/crypto";
import { syncDataSource, type SyncableSource } from "@/lib/sync";
import {
  getWooStoreName, packWooToken, wooConfig, readWooState,
} from "@/lib/integrations/oauth/woocommerce";

export const runtime = "nodejs";

// WooCommerce POSTs the generated key pair here, server-to-server, after the
// store owner approves. There is no user session on this request, so trust is
// established by decrypting the signed `state` we issued at connect time
// (only our authenticated connect route can mint a valid one), and the
// agency is resolved from the client row via the service-role client.
export async function POST(req: Request) {
  let body: {
    user_id?: string; consumer_key?: string; consumer_secret?: string; key_permissions?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { user_id, consumer_key, consumer_secret, key_permissions } = body;
  if (!user_id || !consumer_key || !consumer_secret) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }
  if (key_permissions && key_permissions !== "read" && key_permissions !== "read_write") {
    return NextResponse.json({ error: "Read access is required" }, { status: 400 });
  }

  let clientId: string;
  let storeUrl: string;
  try {
    ({ clientId, storeUrl } = readWooState(user_id)); // throws if forged/tampered
  } catch {
    return NextResponse.json({ error: "Invalid state" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: client } = await supabase
    .from("clients").select("id, agency_id").eq("id", clientId).maybeSingle();
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  try {
    // Verifies the keys work and resolves a display name (throws on bad keys).
    const displayName = await getWooStoreName(storeUrl, consumer_key, consumer_secret);
    const config = wooConfig(storeUrl, displayName);

    // Atomic reconnect: UPSERT on (client_id, type) — see migration 0023.
    const { data: inserted, error } = await supabase
      .from("data_sources")
      .upsert(
        {
          agency_id: client.agency_id,
          client_id: clientId,
          type: "woocommerce",
          display_name: displayName,
          config,
          access_token: encrypt(packWooToken(consumer_key, consumer_secret)),
          refresh_token: null, // key pairs don't rotate — revocation = reconnect
          token_expires_at: new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000).toISOString(),
          status: "connected",
        },
        { onConflict: "client_id,type" }
      )
      .select("id, agency_id, type, config, access_token, refresh_token, token_expires_at")
      .single();
    if (error) throw new Error(error.message);

    await syncDataSource(supabase, inserted as SyncableSource);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
